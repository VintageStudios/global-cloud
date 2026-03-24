const crypto = require("crypto");
const Database = require("better-sqlite3");
const express = require("express");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const SQLITE_DB_PATH = path.join(DATA_DIR, "global-cloud.db");
const LEGACY_JSON_PATH = path.join(DATA_DIR, "global-cloud-db.json");
const OWNER_TEMP_PASSWORD = "GlobalCloudOwner2026!";
const TERMS_VERSION = "2026-03-20";
const DEMO_ACCOUNT_IDS = new Set(["mateo-rivera", "priya-sol", "leila-hassan"]);
const DEMO_COMMUNITY_IDS = new Set(["world-lens", "signal-lab"]);
const DEMO_POST_IDS = new Set(["post-mateo", "post-priya"]);
const ADMIN_BADGE_ID = "moderator";
let sqliteDb = null;
let pgPool = null;

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(password, salt, 64).toString("hex");
    return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
    const [salt, originalHash] = String(storedHash).split(":");
    if (!salt || !originalHash) {
        return false;
    }

    const hashBuffer = Buffer.from(originalHash, "hex");
    const suppliedBuffer = crypto.scryptSync(password, salt, 64);
    return hashBuffer.length === suppliedBuffer.length && crypto.timingSafeEqual(hashBuffer, suppliedBuffer);
}

function sanitizeAccount(account) {
    const { passwordHash, birthDate, ...safeAccount } = account;
    return safeAccount;
}

function baseAccount(data) {
    return {
        id: data.id,
        name: data.name,
        email: data.email,
        bio: data.bio,
        owner: data.owner,
        verified: data.verified,
        joinedCommunities: data.joinedCommunities,
        badgeIds: data.badgeIds || [],
        followers: data.followers || [],
        following: data.following || [],
        acceptedTermsAt: data.acceptedTermsAt || null,
        acceptedTermsVersion: data.acceptedTermsVersion || null,
        ageVerifiedAt: data.ageVerifiedAt || null,
        ageVerified13Plus: Boolean(data.ageVerified13Plus),
        birthDate: data.birthDate || null,
        passwordHash: data.passwordHash,
    };
}

const defaultDb = {
    accounts: [
        baseAccount({
            id: "owner-odell",
            name: "Odell",
            email: "odell8933@gmail.com",
            bio: "Platform founder and primary administrator.",
            owner: true,
            verified: true,
            joinedCommunities: ["cloud-makers"],
            badgeIds: ["founder", "verified-owner"],
            followers: [],
            following: [],
            acceptedTermsAt: new Date().toISOString(),
            acceptedTermsVersion: TERMS_VERSION,
            ageVerifiedAt: new Date().toISOString(),
            ageVerified13Plus: true,
            birthDate: "1990-01-01",
            passwordHash: hashPassword(OWNER_TEMP_PASSWORD),
        }),
    ],
    badges: [
        { id: "founder", name: "Founder", color: "gold" },
        { id: "verified-owner", name: "Verified Owner", color: "blue" },
        { id: "moderator", name: "Moderator", color: "green" }
    ],
    communities: [
        {
            id: "cloud-makers",
            name: "Global Cloud Updates",
            topic: "Platform News",
            description: "Official updates, launch notes, and network announcements from the owner.",
            creatorId: "owner-odell",
            members: ["owner-odell"],
        },
    ],
    posts: [
        {
            id: "post-owner",
            authorId: "owner-odell",
            tag: "Owner Update",
            communityId: "",
            content: "Welcome to Global Cloud. I'm building this space as the owner so people everywhere can share ideas, projects, and updates in one connected community.",
            createdAt: "2m ago",
            upload: null,
            likes: 2700,
            replies: 914,
            likedBy: [],
            comments: [],
        },
    ],
    notifications: [],
    messages: [],
    communityMessages: {
        "cloud-makers": [
            {
                id: "chat-1",
                authorId: "owner-odell",
                content: "Welcome to the official community chat. Share updates and ideas here.",
                createdAt: "Just now",
            },
        ],
    },
    sessions: [],
    liveNotificationIndex: 0,
};

function normalizeDbState(db) {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let changed = false;

    db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
    db.badges = Array.isArray(db.badges) ? db.badges : JSON.parse(JSON.stringify(defaultDb.badges));
    db.notifications = Array.isArray(db.notifications) ? db.notifications : [];
    db.messages = Array.isArray(db.messages) ? db.messages : [];
    db.posts = Array.isArray(db.posts) ? db.posts : [];
    db.communityMessages = typeof db.communityMessages === "object" && db.communityMessages !== null
        ? db.communityMessages
        : {};

    const previousAccountCount = (db.accounts || []).length;
    db.accounts = (db.accounts || []).filter((account) => !DEMO_ACCOUNT_IDS.has(account.id));
    changed = changed || db.accounts.length !== previousAccountCount;

    const previousCommunityCount = (db.communities || []).length;
    db.communities = (db.communities || []).filter((community) => !DEMO_COMMUNITY_IDS.has(community.id));
    changed = changed || db.communities.length !== previousCommunityCount;

    const previousPostCount = (db.posts || []).length;
    db.posts = (db.posts || []).filter((post) => !DEMO_POST_IDS.has(post.id) && !DEMO_ACCOUNT_IDS.has(post.authorId));
    changed = changed || db.posts.length !== previousPostCount;

    const previousMessageCount = db.messages.length;
    db.messages = db.messages.filter((message) => {
        if (!message || typeof message !== "object") {
            return false;
        }

        if (message.sender && ["Leila Hassan", "Owen Park"].includes(message.sender)) {
            return false;
        }

        return Boolean(message.senderId && message.recipientId && String(message.body || "").trim());
    });
    changed = changed || db.messages.length !== previousMessageCount;

    const previousNotificationCount = db.notifications.length;
    db.notifications = db.notifications.filter((notification) => !isAutoNotification(notification));
    changed = changed || db.notifications.length !== previousNotificationCount;
    db.notifications = db.notifications.map((notification) => ({
        ...notification,
        recipientId: notification.recipientId || null,
    }));

    db.accounts = (db.accounts || []).map((account) => {
        if (account.passwordHash) {
            return account;
        }

        changed = true;

        if (account.owner) {
            return {
                ...account,
                passwordHash: hashPassword(OWNER_TEMP_PASSWORD),
            };
        }

        return {
            ...account,
            passwordHash: hashPassword(`TempPass-${account.id}`),
        };
    });

    db.accounts = db.accounts.map((account) => ({
        ...account,
        joinedCommunities: (account.joinedCommunities || []).filter((communityId) => !DEMO_COMMUNITY_IDS.has(communityId)),
        badgeIds: Array.isArray(account.badgeIds) ? account.badgeIds : [],
        followers: Array.isArray(account.followers) ? [...new Set(account.followers.filter(Boolean))] : [],
        following: Array.isArray(account.following) ? [...new Set(account.following.filter(Boolean))] : [],
        acceptedTermsAt: account.acceptedTermsAt || (account.owner ? new Date().toISOString() : null),
        acceptedTermsVersion: account.acceptedTermsVersion || (account.owner ? TERMS_VERSION : null),
        ageVerifiedAt: account.ageVerifiedAt || (account.owner ? new Date().toISOString() : null),
        ageVerified13Plus: account.ageVerified13Plus === true || account.owner === true,
        birthDate: account.birthDate || (account.owner ? "1990-01-01" : null),
    }));

    db.posts = db.posts.map((post) => {
        const likedBy = Array.isArray(post.likedBy) ? [...new Set(post.likedBy.filter(Boolean))] : [];
        const comments = Array.isArray(post.comments) ? post.comments.filter((comment) => (
            comment
            && typeof comment === "object"
            && comment.authorId
            && String(comment.content || "").trim()
        )) : [];

        const normalizedPost = {
            ...post,
            likedBy,
            comments,
            likes: likedBy.length || Number(post.likes || 0),
            replies: comments.length || Number(post.replies || 0),
        };

        if (
            normalizedPost.likes !== post.likes
            || normalizedPost.replies !== post.replies
            || likedBy !== post.likedBy
            || comments !== post.comments
        ) {
            changed = true;
        }

        return normalizedPost;
    });

    defaultDb.badges.forEach((defaultBadge) => {
        if (!db.badges.some((badge) => badge.id === defaultBadge.id)) {
            db.badges.push(defaultBadge);
            changed = true;
        }
    });

    const allowedCommunityIds = new Set((db.communities || []).map((community) => community.id));
    Object.keys(db.communityMessages).forEach((communityId) => {
        if (!allowedCommunityIds.has(communityId)) {
            delete db.communityMessages[communityId];
            changed = true;
        }
    });

    (db.communities || []).forEach((community) => {
        if (!Array.isArray(db.communityMessages[community.id])) {
            db.communityMessages[community.id] = [];
            changed = true;
        }
    });

    const ownerAccount = db.accounts.find((account) => account.id === "owner-odell");
    if (ownerAccount && !ownerAccount.joinedCommunities.includes("cloud-makers")) {
        ownerAccount.joinedCommunities.unshift("cloud-makers");
        changed = true;
    }
    if (ownerAccount) {
        ["founder", "verified-owner"].forEach((badgeId) => {
            if (!ownerAccount.badgeIds.includes(badgeId)) {
                ownerAccount.badgeIds.push(badgeId);
                changed = true;
            }
        });
    }

    if (changed) {
        return { db, changed: true };
    }

    return { db, changed: false };
}

function getSqliteDb() {
    if (sqliteDb) {
        return sqliteDb;
    }

    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    sqliteDb = new Database(SQLITE_DB_PATH);
    sqliteDb.pragma("journal_mode = DELETE");
    sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);
    return sqliteDb;
}

function hasPostgresConfig() {
    return Boolean(process.env.DATABASE_URL);
}

function getStorageBackendName() {
    return hasPostgresConfig() ? "postgres" : "sqlite";
}

function getPostgresPool() {
    if (!hasPostgresConfig()) {
        return null;
    }

    if (pgPool) {
        return pgPool;
    }

    const useSsl = !String(process.env.DATABASE_URL).includes("localhost");
    pgPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
    });
    return pgPool;
}

function readLegacySeedState() {
    if (fs.existsSync(SQLITE_DB_PATH)) {
        try {
            const dbFile = getSqliteDb();
            const stateRow = dbFile.prepare("SELECT value FROM app_state WHERE key = ?").get("state");
            if (stateRow?.value) {
                return JSON.parse(stateRow.value);
            }
        } catch (error) {
            console.warn("SQLite seed read failed:", error.message);
        }
    }

    if (fs.existsSync(LEGACY_JSON_PATH)) {
        return JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf8"));
    }

    return JSON.parse(JSON.stringify(defaultDb));
}

async function ensurePostgresSchema(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            bio TEXT NOT NULL,
            owner BOOLEAN NOT NULL,
            verified BOOLEAN NOT NULL,
            password_hash TEXT NOT NULL,
            accepted_terms_at TEXT,
            accepted_terms_version TEXT,
            age_verified_at TEXT,
            age_verified_13_plus BOOLEAN NOT NULL DEFAULT FALSE,
            birth_date TEXT,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS badges (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            color TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS account_badges (
            account_id TEXT NOT NULL,
            badge_id TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (account_id, badge_id)
        );

        CREATE TABLE IF NOT EXISTS account_follows (
            follower_id TEXT NOT NULL,
            followed_id TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (follower_id, followed_id)
        );

        CREATE TABLE IF NOT EXISTS communities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            topic TEXT NOT NULL,
            description TEXT NOT NULL,
            creator_id TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS community_members (
            community_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            community_sort_index INTEGER NOT NULL DEFAULT 0,
            account_sort_index INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (community_id, account_id)
        );

        CREATE TABLE IF NOT EXISTS community_messages (
            id TEXT PRIMARY KEY,
            community_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at_text TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS posts (
            id TEXT PRIMARY KEY,
            author_id TEXT NOT NULL,
            tag TEXT NOT NULL,
            community_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at_text TEXT NOT NULL,
            upload_json JSONB,
            like_count INTEGER NOT NULL DEFAULT 0,
            reply_count INTEGER NOT NULL DEFAULT 0,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS post_likes (
            post_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (post_id, account_id)
        );

        CREATE TABLE IF NOT EXISTS post_comments (
            id TEXT PRIMARY KEY,
            post_id TEXT NOT NULL,
            author_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at_text TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            time_text TEXT NOT NULL,
            unread BOOLEAN NOT NULL DEFAULT TRUE,
            recipient_id TEXT,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS direct_messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            body TEXT NOT NULL,
            time_text TEXT NOT NULL,
            sort_index INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS sessions (
            token TEXT PRIMARY KEY,
            account_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value_json JSONB NOT NULL
        );
    `);

    await client.query(`
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE posts ADD COLUMN IF NOT EXISTS reply_count INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE community_members ADD COLUMN IF NOT EXISTS community_sort_index INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE community_members ADD COLUMN IF NOT EXISTS account_sort_index INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS recipient_id TEXT;
    `);
}

async function readLegacyPostgresState(client) {
    const existsResult = await client.query("SELECT to_regclass('public.app_state') AS reg");
    if (!existsResult.rows[0]?.reg) {
        return null;
    }

    const stateResult = await client.query("SELECT value FROM app_state WHERE key = $1", ["state"]);
    return stateResult.rowCount ? stateResult.rows[0].value : null;
}

async function syncStateToPostgres(client, db) {
    await client.query("BEGIN");

    try {
        await client.query(`
            DELETE FROM account_badges;
            DELETE FROM account_follows;
            DELETE FROM community_members;
            DELETE FROM community_messages;
            DELETE FROM post_likes;
            DELETE FROM post_comments;
            DELETE FROM notifications;
            DELETE FROM direct_messages;
            DELETE FROM sessions;
            DELETE FROM posts;
            DELETE FROM communities;
            DELETE FROM badges;
            DELETE FROM accounts;
            DELETE FROM app_meta;
        `);

        for (const [index, account] of (db.accounts || []).entries()) {
            await client.query(`
                INSERT INTO accounts (
                    id, name, email, bio, owner, verified, password_hash,
                    accepted_terms_at, accepted_terms_version, age_verified_at,
                    age_verified_13_plus, birth_date, sort_index
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            `, [
                account.id,
                account.name,
                account.email,
                account.bio,
                Boolean(account.owner),
                Boolean(account.verified),
                account.passwordHash,
                account.acceptedTermsAt,
                account.acceptedTermsVersion,
                account.ageVerifiedAt,
                Boolean(account.ageVerified13Plus),
                account.birthDate,
                index,
            ]);

            for (const [badgeIndex, badgeId] of (account.badgeIds || []).entries()) {
                await client.query(
                    "INSERT INTO account_badges (account_id, badge_id, sort_index) VALUES ($1, $2, $3)",
                    [account.id, badgeId, badgeIndex],
                );
            }

            for (const [followIndex, followedId] of (account.following || []).entries()) {
                await client.query(
                    "INSERT INTO account_follows (follower_id, followed_id, sort_index) VALUES ($1, $2, $3)",
                    [account.id, followedId, followIndex],
                );
            }
        }

        for (const [index, badge] of (db.badges || []).entries()) {
            await client.query(
                "INSERT INTO badges (id, name, color, sort_index) VALUES ($1, $2, $3, $4)",
                [badge.id, badge.name, badge.color, index],
            );
        }

        for (const [index, community] of (db.communities || []).entries()) {
            await client.query(`
                INSERT INTO communities (id, name, topic, description, creator_id, sort_index)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                community.id,
                community.name,
                community.topic,
                community.description,
                community.creatorId,
                index,
            ]);
        }

        const membershipMap = new Map();
        (db.communities || []).forEach((community) => {
            (community.members || []).forEach((accountId, index) => {
                const key = `${community.id}::${accountId}`;
                membershipMap.set(key, {
                    communityId: community.id,
                    accountId,
                    communitySortIndex: index,
                    accountSortIndex: 999999,
                });
            });
        });
        (db.accounts || []).forEach((account) => {
            (account.joinedCommunities || []).forEach((communityId, index) => {
                const key = `${communityId}::${account.id}`;
                const existing = membershipMap.get(key) || {
                    communityId,
                    accountId: account.id,
                    communitySortIndex: 999999,
                    accountSortIndex: index,
                };
                existing.accountSortIndex = index;
                membershipMap.set(key, existing);
            });
        });

        for (const membership of membershipMap.values()) {
            await client.query(`
                INSERT INTO community_members (community_id, account_id, community_sort_index, account_sort_index)
                VALUES ($1, $2, $3, $4)
            `, [
                membership.communityId,
                membership.accountId,
                membership.communitySortIndex,
                membership.accountSortIndex,
            ]);
        }

        for (const community of (db.communities || [])) {
            const messages = db.communityMessages?.[community.id] || [];
            for (const [index, message] of messages.entries()) {
                await client.query(`
                    INSERT INTO community_messages (id, community_id, author_id, content, created_at_text, sort_index)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    message.id,
                    community.id,
                    message.authorId,
                    message.content,
                    message.createdAt || "Just now",
                    index,
                ]);
            }
        }

        for (const [index, post] of (db.posts || []).entries()) {
            await client.query(`
                INSERT INTO posts (
                    id, author_id, tag, community_id, content, created_at_text,
                    upload_json, like_count, reply_count, sort_index
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
            `, [
                post.id,
                post.authorId,
                post.tag,
                post.communityId || "",
                post.content,
                post.createdAt || "Just now",
                JSON.stringify(post.upload || null),
                Number(post.likes || 0),
                Number(post.replies || 0),
                index,
            ]);

            for (const [likeIndex, accountId] of (post.likedBy || []).entries()) {
                await client.query(
                    "INSERT INTO post_likes (post_id, account_id, sort_index) VALUES ($1, $2, $3)",
                    [post.id, accountId, likeIndex],
                );
            }

            for (const [commentIndex, comment] of ((post.comments || []).entries())) {
                await client.query(`
                    INSERT INTO post_comments (id, post_id, author_id, content, created_at_text, sort_index)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `, [
                    comment.id,
                    post.id,
                    comment.authorId,
                    comment.content,
                    comment.createdAt || "Just now",
                    commentIndex,
                ]);
            }
        }

        for (const [index, notification] of (db.notifications || []).entries()) {
            await client.query(`
                INSERT INTO notifications (id, title, body, time_text, unread, recipient_id, sort_index)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [
                notification.id,
                notification.title,
                notification.body,
                notification.time || "Just now",
                Boolean(notification.unread),
                notification.recipientId || null,
                index,
            ]);
        }

        for (const [index, message] of (db.messages || []).entries()) {
            await client.query(`
                INSERT INTO direct_messages (id, sender_id, recipient_id, body, time_text, sort_index)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [
                message.id,
                message.senderId,
                message.recipientId,
                message.body,
                message.time || "Just now",
                index,
            ]);
        }

        for (const session of (db.sessions || [])) {
            await client.query(
                "INSERT INTO sessions (token, account_id, created_at) VALUES ($1, $2, $3)",
                [session.token, session.accountId, session.createdAt],
            );
        }

        await client.query(
            "INSERT INTO app_meta (key, value_json) VALUES ($1, $2::jsonb)",
            ["liveNotificationIndex", JSON.stringify(db.liveNotificationIndex || 0)],
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
}

async function readStateFromPostgres(client) {
    const [
        accountResult,
        badgeResult,
        accountBadgeResult,
        accountFollowResult,
        communityResult,
        communityMemberResult,
        communityMessageResult,
        postResult,
        postLikeResult,
        postCommentResult,
        notificationResult,
        directMessageResult,
        sessionResult,
        metaResult,
    ] = await Promise.all([
        client.query("SELECT * FROM accounts ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM badges ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM account_badges ORDER BY account_id ASC, sort_index ASC, badge_id ASC"),
        client.query("SELECT * FROM account_follows ORDER BY follower_id ASC, sort_index ASC, followed_id ASC"),
        client.query("SELECT * FROM communities ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM community_members"),
        client.query("SELECT * FROM community_messages ORDER BY community_id ASC, sort_index ASC, id ASC"),
        client.query("SELECT * FROM posts ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM post_likes ORDER BY post_id ASC, sort_index ASC, account_id ASC"),
        client.query("SELECT * FROM post_comments ORDER BY post_id ASC, sort_index ASC, id ASC"),
        client.query("SELECT * FROM notifications ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM direct_messages ORDER BY sort_index ASC, id ASC"),
        client.query("SELECT * FROM sessions ORDER BY created_at ASC, token ASC"),
        client.query("SELECT * FROM app_meta"),
    ]);

    const accounts = accountResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        bio: row.bio,
        owner: row.owner,
        verified: row.verified,
        joinedCommunities: [],
        badgeIds: [],
        followers: [],
        following: [],
        acceptedTermsAt: row.accepted_terms_at,
        acceptedTermsVersion: row.accepted_terms_version,
        ageVerifiedAt: row.age_verified_at,
        ageVerified13Plus: row.age_verified_13_plus,
        birthDate: row.birth_date,
        passwordHash: row.password_hash,
    }));
    const accountsById = new Map(accounts.map((account) => [account.id, account]));

    const badges = badgeResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        color: row.color,
    }));

    accountBadgeResult.rows.forEach((row) => {
        const account = accountsById.get(row.account_id);
        if (account) {
            account.badgeIds.push(row.badge_id);
        }
    });

    accountFollowResult.rows.forEach((row) => {
        const follower = accountsById.get(row.follower_id);
        const followed = accountsById.get(row.followed_id);
        if (follower) {
            follower.following.push(row.followed_id);
        }
        if (followed) {
            followed.followers.push(row.follower_id);
        }
    });

    const communities = communityResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        topic: row.topic,
        description: row.description,
        creatorId: row.creator_id,
        members: [],
    }));
    const communitiesById = new Map(communities.map((community) => [community.id, community]));

    [...communityMemberResult.rows]
        .sort((a, b) => (
            a.community_id.localeCompare(b.community_id)
            || a.community_sort_index - b.community_sort_index
            || a.account_id.localeCompare(b.account_id)
        ))
        .forEach((row) => {
        const community = communitiesById.get(row.community_id);
        if (community) {
            community.members.push(row.account_id);
        }
    });

    [...communityMemberResult.rows]
        .sort((a, b) => (
            a.account_id.localeCompare(b.account_id)
            || a.account_sort_index - b.account_sort_index
            || a.community_id.localeCompare(b.community_id)
        ))
        .forEach((row) => {
            const account = accountsById.get(row.account_id);
            if (account) {
                account.joinedCommunities.push(row.community_id);
            }
        });

    const communityMessages = {};
    communityMessageResult.rows.forEach((row) => {
        if (!Array.isArray(communityMessages[row.community_id])) {
            communityMessages[row.community_id] = [];
        }
        communityMessages[row.community_id].push({
            id: row.id,
            authorId: row.author_id,
            content: row.content,
            createdAt: row.created_at_text,
        });
    });
    communities.forEach((community) => {
        if (!Array.isArray(communityMessages[community.id])) {
            communityMessages[community.id] = [];
        }
    });

    const posts = postResult.rows.map((row) => ({
        id: row.id,
        authorId: row.author_id,
        tag: row.tag,
        communityId: row.community_id,
        content: row.content,
        createdAt: row.created_at_text,
        upload: row.upload_json,
        likes: Number(row.like_count || 0),
        replies: Number(row.reply_count || 0),
        likedBy: [],
        comments: [],
    }));
    const postsById = new Map(posts.map((post) => [post.id, post]));

    postLikeResult.rows.forEach((row) => {
        const post = postsById.get(row.post_id);
        if (post) {
            post.likedBy.push(row.account_id);
        }
    });

    postCommentResult.rows.forEach((row) => {
        const post = postsById.get(row.post_id);
        if (post) {
            post.comments.push({
                id: row.id,
                authorId: row.author_id,
                content: row.content,
                createdAt: row.created_at_text,
            });
        }
    });

    posts.forEach((post) => {
        post.likes = Math.max(post.likes, post.likedBy.length);
        post.replies = Math.max(post.replies, post.comments.length);
    });

    const notifications = notificationResult.rows.map((row) => ({
        id: row.id,
        title: row.title,
        body: row.body,
        time: row.time_text,
        unread: row.unread,
        recipientId: row.recipient_id,
    }));

    const messages = directMessageResult.rows.map((row) => ({
        id: row.id,
        senderId: row.sender_id,
        recipientId: row.recipient_id,
        body: row.body,
        time: row.time_text,
    }));

    const sessions = sessionResult.rows.map((row) => ({
        token: row.token,
        accountId: row.account_id,
        createdAt: row.created_at,
    }));

    const liveNotificationIndex = Number(
        metaResult.rows.find((row) => row.key === "liveNotificationIndex")?.value_json ?? 0,
    ) || 0;

    return {
        accounts,
        badges,
        communities,
        communityMessages,
        posts,
        notifications,
        messages,
        sessions,
        liveNotificationIndex,
    };
}

async function ensureDb() {
    if (hasPostgresConfig()) {
        const pool = getPostgresPool();
        const client = await pool.connect();

        try {
            await ensurePostgresSchema(client);
            const countResult = await client.query("SELECT COUNT(*)::int AS count FROM accounts");

            if (countResult.rows[0].count === 0) {
                const legacyState = await readLegacyPostgresState(client);
                const { db } = normalizeDbState(legacyState || readLegacySeedState());
                await syncStateToPostgres(client, db);
                return;
            }

            const loadedState = await readStateFromPostgres(client);
            const { db, changed } = normalizeDbState(loadedState);
            if (changed) {
                await syncStateToPostgres(client, db);
            }
        } finally {
            client.release();
        }
        return;
    }

    const dbFile = getSqliteDb();
    const stateRow = dbFile.prepare("SELECT value FROM app_state WHERE key = ?").get("state");

    if (!stateRow) {
        const { db } = normalizeDbState(readLegacySeedState());
        dbFile.prepare("INSERT INTO app_state (key, value) VALUES (?, ?)").run("state", JSON.stringify(db));
        return;
    }

    const parsedState = JSON.parse(stateRow.value);
    const { db, changed } = normalizeDbState(parsedState);
    if (changed) {
        dbFile.prepare("UPDATE app_state SET value = ? WHERE key = ?").run(JSON.stringify(db), "state");
    }
}

async function readDb() {
    await ensureDb();

    if (hasPostgresConfig()) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            return await readStateFromPostgres(client);
        } finally {
            client.release();
        }
    }

    const dbFile = getSqliteDb();
    const row = dbFile.prepare("SELECT value FROM app_state WHERE key = ?").get("state");
    return row ? JSON.parse(row.value) : JSON.parse(JSON.stringify(defaultDb));
}

async function writeDb(db) {
    if (hasPostgresConfig()) {
        const pool = getPostgresPool();
        const client = await pool.connect();
        try {
            await ensurePostgresSchema(client);
            await syncStateToPostgres(client, db);
        } finally {
            client.release();
        }
        return;
    }

    const dbFile = getSqliteDb();
    dbFile.prepare("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .run("state", JSON.stringify(db));
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || `item-${Date.now()}`;
}

function addNotification(db, title, body, time = "Just now") {
    db.notifications.unshift({
        id: `note-${Date.now()}`,
        title,
        body,
        time,
        unread: true,
        recipientId: null,
    });
}

function addTargetedNotification(db, recipientId, title, body, time = "Just now") {
    db.notifications.unshift({
        id: `note-${Date.now()}-${recipientId}`,
        title,
        body,
        time,
        unread: true,
        recipientId,
    });
}

function isAutoNotification(notification) {
    const autoTitles = new Set([
        "Owner account active",
        "Communities live",
        "New follower request",
        "Community spike",
        "Upload received",
    ]);
    return autoTitles.has(String(notification?.title || ""));
}

function buildClientState(db, viewerId = "") {
    const visibleMessages = viewerId
        ? (db.messages || []).filter((message) => message.senderId === viewerId || message.recipientId === viewerId)
        : [];
    const visibleNotifications = viewerId
        ? (db.notifications || []).filter((notification) => !notification.recipientId || notification.recipientId === viewerId)
        : (db.notifications || []);

    return {
        accounts: db.accounts.map(sanitizeAccount),
        badges: db.badges,
        communities: db.communities,
        communityMessages: db.communityMessages,
        posts: db.posts,
        notifications: visibleNotifications,
        messages: visibleMessages,
        liveNotificationIndex: db.liveNotificationIndex,
    };
}

function yearsOldOnDate(birthDateText, today = new Date()) {
    const birthDate = new Date(birthDateText);
    if (Number.isNaN(birthDate.getTime())) {
        return -1;
    }

    let years = today.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDiff = today.getUTCMonth() - birthDate.getUTCMonth();
    const dayDiff = today.getUTCDate() - birthDate.getUTCDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        years -= 1;
    }

    return years;
}

function createSession(db, accountId) {
    const token = crypto.randomUUID();
    db.sessions = db.sessions.filter((session) => session.accountId !== accountId);
    db.sessions.push({
        token,
        accountId,
        createdAt: new Date().toISOString(),
    });
    return token;
}

function getToken(req) {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
        return null;
    }
    return authHeader.slice(7);
}

async function requireAuth(req, res, next) {
    const db = await readDb();
    const token = getToken(req);
    const session = db.sessions.find((entry) => entry.token === token);

    if (!session) {
        return res.status(401).json({ error: "Authentication required." });
    }

    const account = db.accounts.find((entry) => entry.id === session.accountId);
    if (!account) {
        return res.status(401).json({ error: "Account not found." });
    }

    req.db = db;
    req.account = account;
    req.session = session;
    return next();
}

function requireOwner(req, res, next) {
    if (!req.account.owner) {
        return res.status(403).json({ error: "Owner access required." });
    }

    return next();
}

function isAdminAccount(account) {
    return account.owner || (account.badgeIds || []).includes(ADMIN_BADGE_ID);
}

function requireAdmin(req, res, next) {
    if (!isAdminAccount(req.account)) {
        return res.status(403).json({ error: "Admin access required." });
    }

    return next();
}

function buildAdminState(db) {
    return {
        badges: db.badges,
        accounts: db.accounts.map((account) => ({
            ...sanitizeAccount(account),
            activeSessionCount: db.sessions.filter((session) => session.accountId === account.id).length,
        })),
    };
}

function generateTempPassword() {
    return `GC-${crypto.randomBytes(4).toString("hex")}-Temp!`;
}

app.use(express.json({ limit: "10mb" }));
app.use((req, res, next) => {
    const origin = req.headers.origin || "";
    const allowedOrigins = new Set([
        "https://app.tylervox.org",
        "https://global-cloud-production.up.railway.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]);

    if (allowedOrigins.has(origin)) {
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Vary", "Origin");
    }

    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

    if (req.method === "OPTIONS") {
        return res.sendStatus(204);
    }

    return next();
});
app.use(express.static(__dirname));

app.get("/api/health/storage", async (req, res) => {
    return res.json({
        backend: getStorageBackendName(),
        hasDatabaseUrl: hasPostgresConfig(),
    });
});

app.post("/api/auth/register", async (req, res) => {
    const db = await readDb();
    const { name, email, password, bio, acceptedTerms, birthDate, acceptedAge13Plus } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
    }

    if (acceptedTerms !== true) {
        return res.status(400).json({ error: "You must accept the Terms of Use before creating an account." });
    }

    if (acceptedAge13Plus !== true) {
        return res.status(400).json({ error: "You must confirm that you are at least 13 years old." });
    }

    const age = yearsOldOnDate(birthDate);
    if (age < 13) {
        return res.status(400).json({ error: "You must be at least 13 years old to create an account." });
    }

    const id = slugify(name);
    const exists = db.accounts.some(
        (account) => account.id === id || account.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (exists) {
        return res.status(409).json({ error: "That account already exists." });
    }

    const account = {
        id,
        name,
        email,
        bio: bio || "New Global Cloud member.",
        owner: false,
        verified: false,
        joinedCommunities: [],
        badgeIds: [],
        acceptedTermsAt: new Date().toISOString(),
        acceptedTermsVersion: TERMS_VERSION,
        ageVerifiedAt: new Date().toISOString(),
        ageVerified13Plus: true,
        birthDate,
        passwordHash: hashPassword(password),
    };

    db.accounts.push(account);
    const token = createSession(db, account.id);
    addNotification(db, "New account created", `${name} can now post and join communities.`);
    await writeDb(db);

    return res.status(201).json({
        token,
        account: sanitizeAccount(account),
        state: buildClientState(db, account.id),
    });
});

app.post("/api/auth/login", async (req, res) => {
    const db = await readDb();
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const account = db.accounts.find((entry) => entry.email.toLowerCase() === String(email).toLowerCase());
    if (!account || !verifyPassword(password, account.passwordHash)) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createSession(db, account.id);
    await writeDb(db);

    return res.json({
        token,
        account: sanitizeAccount(account),
        state: buildClientState(db, account.id),
    });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
    return res.json({
        account: sanitizeAccount(req.account),
        state: buildClientState(req.db, req.account.id),
    });
});

app.post("/api/auth/logout", requireAuth, async (req, res) => {
    req.db.sessions = req.db.sessions.filter((entry) => entry.token !== req.session.token);
    await writeDb(req.db);
    return res.json({ success: true });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, async (req, res) => {
    return res.json(buildAdminState(req.db));
});

app.post("/api/admin/badges", requireAuth, requireAdmin, async (req, res) => {
    const { name, color } = req.body;

    if (!name || !color) {
        return res.status(400).json({ error: "Badge name and color are required." });
    }

    const id = slugify(name);
    if (req.db.badges.some((badge) => badge.id === id)) {
        return res.status(409).json({ error: "That badge already exists." });
    }

    req.db.badges.push({ id, name, color: String(color).toLowerCase() });
    await writeDb(req.db);
    return res.status(201).json(buildAdminState(req.db));
});

app.post("/api/admin/notifications", requireAuth, requireOwner, async (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();

    if (!title || !body) {
        return res.status(400).json({ error: "Notification title and message are required." });
    }

    addNotification(req.db, title, body);
    await writeDb(req.db);
    return res.status(201).json({
        state: buildClientState(req.db, req.account.id),
        admin: buildAdminState(req.db),
    });
});

app.post("/api/admin/accounts/:id/toggle-badge", requireAuth, requireAdmin, async (req, res) => {
    const { badgeId } = req.body;
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);
    const badge = req.db.badges.find((entry) => entry.id === badgeId);

    if (!account || !badge) {
        return res.status(404).json({ error: "Account or badge not found." });
    }

    if (account.badgeIds.includes(badgeId)) {
        account.badgeIds = account.badgeIds.filter((id) => id !== badgeId);
    } else {
        account.badgeIds.push(badgeId);
    }

    await writeDb(req.db);
    return res.json(buildAdminState(req.db));
});

app.post("/api/admin/accounts/:id/reset-password", requireAuth, requireAdmin, async (req, res) => {
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!account) {
        return res.status(404).json({ error: "Account not found." });
    }

    const temporaryPassword = generateTempPassword();
    account.passwordHash = hashPassword(temporaryPassword);
    req.db.sessions = req.db.sessions.filter((session) => session.accountId !== account.id);
    await writeDb(req.db);

    return res.json({
        accountId: account.id,
        temporaryPassword,
        admin: buildAdminState(req.db),
    });
});

app.post("/api/admin/accounts/:id/revoke-sessions", requireAuth, requireAdmin, async (req, res) => {
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!account) {
        return res.status(404).json({ error: "Account not found." });
    }

    req.db.sessions = req.db.sessions.filter((session) => session.accountId !== account.id);
    await writeDb(req.db);
    return res.json(buildAdminState(req.db));
});

app.get("/api/state", requireAuth, async (req, res) => {
    res.json(buildClientState(req.db, req.account.id));
});

app.post("/api/accounts/:id/follow", requireAuth, async (req, res) => {
    const target = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!target) {
        return res.status(404).json({ error: "Account not found." });
    }

    if (target.id === req.account.id) {
        return res.status(400).json({ error: "You cannot follow your own account." });
    }

    req.account.following = Array.isArray(req.account.following) ? req.account.following : [];
    target.followers = Array.isArray(target.followers) ? target.followers : [];

    if (req.account.following.includes(target.id)) {
        req.account.following = req.account.following.filter((accountId) => accountId !== target.id);
        target.followers = target.followers.filter((accountId) => accountId !== req.account.id);
    } else {
        req.account.following.unshift(target.id);
        if (!target.followers.includes(req.account.id)) {
            target.followers.unshift(req.account.id);
        }
        addTargetedNotification(
            req.db,
            target.id,
            "New follower",
            `${req.account.name} started following you.`,
        );
    }

    await writeDb(req.db);
    return res.json(buildClientState(req.db, req.account.id));
});

app.post("/api/communities", requireAuth, async (req, res) => {
    const db = req.db;
    const { name, topic, description } = req.body;

    if (!name || !topic || !description) {
        return res.status(400).json({ error: "Missing community fields." });
    }

    const id = slugify(name);
    if (db.communities.some((community) => community.id === id)) {
        return res.status(409).json({ error: "That community already exists." });
    }

    db.communities.unshift({
        id,
        name,
        topic,
        description,
        creatorId: req.account.id,
        members: [req.account.id],
    });
    db.communityMessages[id] = [];

    if (!req.account.joinedCommunities.includes(id)) {
        req.account.joinedCommunities.unshift(id);
    }

    addNotification(db, "Community created", `${req.account.name} created ${name}.`);
    await writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/communities/:id/toggle-membership", requireAuth, async (req, res) => {
    const db = req.db;
    const community = db.communities.find((entry) => entry.id === req.params.id);

    if (!community) {
        return res.status(404).json({ error: "Community not found." });
    }

    const joinedIndex = req.account.joinedCommunities.indexOf(community.id);
    if (joinedIndex >= 0) {
        req.account.joinedCommunities.splice(joinedIndex, 1);
        community.members = community.members.filter((memberId) => memberId !== req.account.id);
        addNotification(db, "Community left", `${req.account.name} left ${community.name}.`);
    } else {
        req.account.joinedCommunities.unshift(community.id);
        if (!community.members.includes(req.account.id)) {
            community.members.push(req.account.id);
        }
        addNotification(db, "Community joined", `${req.account.name} joined ${community.name}.`);
    }

    await writeDb(db);
    return res.json(buildClientState(db, req.account.id));
});

app.get("/api/communities/:id/messages", requireAuth, async (req, res) => {
    const db = req.db;
    const community = db.communities.find((entry) => entry.id === req.params.id);

    if (!community) {
        return res.status(404).json({ error: "Community not found." });
    }

    if (!community.members.includes(req.account.id)) {
        return res.status(403).json({ error: "Join this community to view chat." });
    }

    return res.json({
        communityId: community.id,
        messages: db.communityMessages[community.id] || [],
    });
});

app.post("/api/communities/:id/messages", requireAuth, async (req, res) => {
    const db = req.db;
    const { content } = req.body;
    const community = db.communities.find((entry) => entry.id === req.params.id);

    if (!community) {
        return res.status(404).json({ error: "Community not found." });
    }

    if (!community.members.includes(req.account.id)) {
        return res.status(403).json({ error: "Join this community before chatting." });
    }

    if (!content || !String(content).trim()) {
        return res.status(400).json({ error: "Message content is required." });
    }

    if (!Array.isArray(db.communityMessages[community.id])) {
        db.communityMessages[community.id] = [];
    }

    db.communityMessages[community.id].push({
        id: `chat-${Date.now()}`,
        authorId: req.account.id,
        content: String(content).trim(),
        createdAt: "Just now",
    });

    await writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/posts", requireAuth, async (req, res) => {
    const db = req.db;
    const { tag, communityId, content, upload } = req.body;

    if (!content) {
        return res.status(400).json({ error: "Content is required." });
    }

    db.posts.unshift({
        id: `post-${Date.now()}`,
        authorId: req.account.id,
        tag: tag || "General",
        communityId: communityId || "",
        content,
        createdAt: "Just now",
        upload: upload || null,
        likes: 0,
        replies: 0,
    });

    const destination = communityId
        ? db.communities.find((community) => community.id === communityId)?.name || "a community"
        : "the global feed";

    addNotification(db, "Post published", `${req.account.name} shared a post to ${destination}.`);
    (req.account.followers || []).forEach((followerId) => {
        addTargetedNotification(
            db,
            followerId,
            `New post from ${req.account.name}`,
            `${req.account.name} shared a new update${communityId ? ` in ${destination}` : ""}.`,
        );
    });
    await writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/posts/:id/like", requireAuth, async (req, res) => {
    const db = req.db;
    const post = db.posts.find((entry) => entry.id === req.params.id);

    if (!post) {
        return res.status(404).json({ error: "Post not found." });
    }

    post.likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];

    if (post.likedBy.includes(req.account.id)) {
        post.likedBy = post.likedBy.filter((accountId) => accountId !== req.account.id);
        post.likes = Math.max(0, Number(post.likes || 0) - 1);
    } else {
        post.likedBy.unshift(req.account.id);
        post.likes = Number(post.likes || 0) + 1;
    }
    await writeDb(db);
    return res.json(buildClientState(db, req.account.id));
});

app.post("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const db = req.db;
    const post = db.posts.find((entry) => entry.id === req.params.id);
    const content = String(req.body?.content || "").trim();

    if (!post) {
        return res.status(404).json({ error: "Post not found." });
    }

    if (!content) {
        return res.status(400).json({ error: "Comment content is required." });
    }

    post.comments = Array.isArray(post.comments) ? post.comments : [];
    post.comments.push({
        id: `comment-${Date.now()}`,
        authorId: req.account.id,
        content,
        createdAt: "Just now",
    });
    post.replies = Number(post.replies || 0) + 1;

    await writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/messages", requireAuth, async (req, res) => {
    const db = req.db;
    const recipientId = String(req.body?.recipientId || "").trim();
    const body = String(req.body?.body || "").trim();
    const recipient = db.accounts.find((account) => account.id === recipientId);

    if (!recipient) {
        return res.status(404).json({ error: "Recipient not found." });
    }

    if (recipient.id === req.account.id) {
        return res.status(400).json({ error: "You cannot message yourself." });
    }

    if (!body) {
        return res.status(400).json({ error: "Message content is required." });
    }

    db.messages.push({
        id: `dm-${Date.now()}`,
        senderId: req.account.id,
        recipientId: recipient.id,
        body,
        time: "Just now",
    });

    await writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/notifications/clear", requireAuth, async (req, res) => {
    req.db.notifications = req.db.notifications.map((notification) => {
        if (!notification.recipientId || notification.recipientId === req.account.id) {
            return {
                ...notification,
                unread: false,
            };
        }

        return notification;
    });
    await writeDb(req.db);
    return res.json(buildClientState(req.db, req.account.id));
});

app.listen(PORT, async () => {
    await ensureDb();
    console.log(`Storage backend: ${getStorageBackendName()}`);
    console.log(`Global Cloud server running at http://localhost:${PORT}`);
});
