const crypto = require("crypto");
const Database = require("better-sqlite3");
const express = require("express");
const fs = require("fs");
const path = require("path");

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

function ensureDb() {
    const dbFile = getSqliteDb();
    const stateRow = dbFile.prepare("SELECT value FROM app_state WHERE key = ?").get("state");

    if (!stateRow) {
        const seedState = fs.existsSync(LEGACY_JSON_PATH)
            ? JSON.parse(fs.readFileSync(LEGACY_JSON_PATH, "utf8"))
            : JSON.parse(JSON.stringify(defaultDb));
        const { db } = normalizeDbState(seedState);
        dbFile.prepare("INSERT INTO app_state (key, value) VALUES (?, ?)").run("state", JSON.stringify(db));
        return;
    }

    const parsedState = JSON.parse(stateRow.value);
    const { db, changed } = normalizeDbState(parsedState);
    if (changed) {
        dbFile.prepare("UPDATE app_state SET value = ? WHERE key = ?").run(JSON.stringify(db), "state");
    }
}

function readDb() {
    ensureDb();
    const dbFile = getSqliteDb();
    const row = dbFile.prepare("SELECT value FROM app_state WHERE key = ?").get("state");
    return row ? JSON.parse(row.value) : JSON.parse(JSON.stringify(defaultDb));
}

function writeDb(db) {
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

    return {
        accounts: db.accounts.map(sanitizeAccount),
        badges: db.badges,
        communities: db.communities,
        communityMessages: db.communityMessages,
        posts: db.posts,
        notifications: db.notifications,
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

function requireAuth(req, res, next) {
    const db = readDb();
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

app.post("/api/auth/register", (req, res) => {
    const db = readDb();
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
    writeDb(db);

    return res.status(201).json({
        token,
        account: sanitizeAccount(account),
        state: buildClientState(db, account.id),
    });
});

app.post("/api/auth/login", (req, res) => {
    const db = readDb();
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const account = db.accounts.find((entry) => entry.email.toLowerCase() === String(email).toLowerCase());
    if (!account || !verifyPassword(password, account.passwordHash)) {
        return res.status(401).json({ error: "Invalid email or password." });
    }

    const token = createSession(db, account.id);
    writeDb(db);

    return res.json({
        token,
        account: sanitizeAccount(account),
        state: buildClientState(db, account.id),
    });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({
        account: sanitizeAccount(req.account),
        state: buildClientState(req.db, req.account.id),
    });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.db.sessions = req.db.sessions.filter((entry) => entry.token !== req.session.token);
    writeDb(req.db);
    return res.json({ success: true });
});

app.get("/api/admin/overview", requireAuth, requireAdmin, (req, res) => {
    return res.json(buildAdminState(req.db));
});

app.post("/api/admin/badges", requireAuth, requireAdmin, (req, res) => {
    const { name, color } = req.body;

    if (!name || !color) {
        return res.status(400).json({ error: "Badge name and color are required." });
    }

    const id = slugify(name);
    if (req.db.badges.some((badge) => badge.id === id)) {
        return res.status(409).json({ error: "That badge already exists." });
    }

    req.db.badges.push({ id, name, color: String(color).toLowerCase() });
    writeDb(req.db);
    return res.status(201).json(buildAdminState(req.db));
});

app.post("/api/admin/notifications", requireAuth, requireOwner, (req, res) => {
    const title = String(req.body?.title || "").trim();
    const body = String(req.body?.body || "").trim();

    if (!title || !body) {
        return res.status(400).json({ error: "Notification title and message are required." });
    }

    addNotification(req.db, title, body);
    writeDb(req.db);
    return res.status(201).json({
        state: buildClientState(req.db, req.account.id),
        admin: buildAdminState(req.db),
    });
});

app.post("/api/admin/accounts/:id/toggle-badge", requireAuth, requireAdmin, (req, res) => {
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

    writeDb(req.db);
    return res.json(buildAdminState(req.db));
});

app.post("/api/admin/accounts/:id/reset-password", requireAuth, requireAdmin, (req, res) => {
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!account) {
        return res.status(404).json({ error: "Account not found." });
    }

    const temporaryPassword = generateTempPassword();
    account.passwordHash = hashPassword(temporaryPassword);
    req.db.sessions = req.db.sessions.filter((session) => session.accountId !== account.id);
    writeDb(req.db);

    return res.json({
        accountId: account.id,
        temporaryPassword,
        admin: buildAdminState(req.db),
    });
});

app.post("/api/admin/accounts/:id/revoke-sessions", requireAuth, requireAdmin, (req, res) => {
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!account) {
        return res.status(404).json({ error: "Account not found." });
    }

    req.db.sessions = req.db.sessions.filter((session) => session.accountId !== account.id);
    writeDb(req.db);
    return res.json(buildAdminState(req.db));
});

app.get("/api/state", requireAuth, (req, res) => {
    res.json(buildClientState(req.db, req.account.id));
});

app.post("/api/communities", requireAuth, (req, res) => {
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
    writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/communities/:id/toggle-membership", requireAuth, (req, res) => {
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

    writeDb(db);
    return res.json(buildClientState(db, req.account.id));
});

app.get("/api/communities/:id/messages", requireAuth, (req, res) => {
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

app.post("/api/communities/:id/messages", requireAuth, (req, res) => {
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

    writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/posts", requireAuth, (req, res) => {
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
    writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/posts/:id/like", requireAuth, (req, res) => {
    const db = req.db;
    const post = db.posts.find((entry) => entry.id === req.params.id);

    if (!post) {
        return res.status(404).json({ error: "Post not found." });
    }

    post.likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];

    if (post.likedBy.includes(req.account.id)) {
        post.likedBy = post.likedBy.filter((accountId) => accountId !== req.account.id);
    } else {
        post.likedBy.unshift(req.account.id);
    }

    post.likes = post.likedBy.length;
    writeDb(db);
    return res.json(buildClientState(db, req.account.id));
});

app.post("/api/posts/:id/comments", requireAuth, (req, res) => {
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
    post.replies = post.comments.length;

    writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/messages", requireAuth, (req, res) => {
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

    writeDb(db);
    return res.status(201).json(buildClientState(db, req.account.id));
});

app.post("/api/notifications/clear", requireAuth, (req, res) => {
    req.db.notifications = req.db.notifications.map((notification) => ({
        ...notification,
        unread: false,
    }));
    writeDb(req.db);
    return res.json(buildClientState(req.db, req.account.id));
});

app.listen(PORT, () => {
    ensureDb();
    console.log(`Global Cloud server running at http://localhost:${PORT}`);
});
