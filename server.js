const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "global-cloud-db.json");
const OWNER_TEMP_PASSWORD = "GlobalCloudOwner2026!";
const DEMO_ACCOUNT_IDS = new Set(["mateo-rivera", "priya-sol", "leila-hassan"]);
const DEMO_COMMUNITY_IDS = new Set(["world-lens", "signal-lab"]);
const DEMO_POST_IDS = new Set(["post-mateo", "post-priya"]);

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
    const { passwordHash, ...safeAccount } = account;
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
            passwordHash: hashPassword(OWNER_TEMP_PASSWORD),
        }),
    ],
    badges: [
        { id: "founder", name: "Founder", color: "gold" },
        { id: "verified-owner", name: "Verified Owner", color: "blue" }
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
        },
    ],
    notifications: [
        {
            id: "note-1",
            title: "Owner account active",
            body: "Your Global Cloud owner profile is visible with badges.",
            time: "Just now",
            unread: true,
        },
        {
            id: "note-2",
            title: "Communities live",
            body: "Members can now create and join communities.",
            time: "4 min ago",
            unread: true,
        },
    ],
    messages: [],
    sessions: [],
    liveNotificationIndex: 0,
};

function ensureDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2));
        return;
    }

    const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    let changed = false;

    db.sessions = Array.isArray(db.sessions) ? db.sessions : [];
    db.badges = Array.isArray(db.badges) ? db.badges : JSON.parse(JSON.stringify(defaultDb.badges));

    const previousAccountCount = (db.accounts || []).length;
    db.accounts = (db.accounts || []).filter((account) => !DEMO_ACCOUNT_IDS.has(account.id));
    changed = changed || db.accounts.length !== previousAccountCount;

    const previousCommunityCount = (db.communities || []).length;
    db.communities = (db.communities || []).filter((community) => !DEMO_COMMUNITY_IDS.has(community.id));
    changed = changed || db.communities.length !== previousCommunityCount;

    const previousPostCount = (db.posts || []).length;
    db.posts = (db.posts || []).filter((post) => !DEMO_POST_IDS.has(post.id) && !DEMO_ACCOUNT_IDS.has(post.authorId));
    changed = changed || db.posts.length !== previousPostCount;

    const previousMessageCount = (db.messages || []).length;
    db.messages = (db.messages || []).filter((message) => !["Leila Hassan", "Owen Park"].includes(message.sender));
    changed = changed || db.messages.length !== previousMessageCount;

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
    }));

    const ownerAccount = db.accounts.find((account) => account.id === "owner-odell");
    if (ownerAccount && !ownerAccount.joinedCommunities.includes("cloud-makers")) {
        ownerAccount.joinedCommunities.unshift("cloud-makers");
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
}

function readDb() {
    ensureDb();
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function writeDb(db) {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
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

function buildClientState(db) {
    return {
        accounts: db.accounts.map(sanitizeAccount),
        badges: db.badges,
        communities: db.communities,
        posts: db.posts,
        notifications: db.notifications,
        messages: db.messages,
        liveNotificationIndex: db.liveNotificationIndex,
    };
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
app.use(express.static(__dirname));

app.post("/api/auth/register", (req, res) => {
    const db = readDb();
    const { name, email, password, bio } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required." });
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
        passwordHash: hashPassword(password),
    };

    db.accounts.push(account);
    const token = createSession(db, account.id);
    addNotification(db, "New account created", `${name} can now post and join communities.`);
    writeDb(db);

    return res.status(201).json({
        token,
        account: sanitizeAccount(account),
        state: buildClientState(db),
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
        state: buildClientState(db),
    });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
    return res.json({
        account: sanitizeAccount(req.account),
        state: buildClientState(req.db),
    });
});

app.post("/api/auth/logout", requireAuth, (req, res) => {
    req.db.sessions = req.db.sessions.filter((entry) => entry.token !== req.session.token);
    writeDb(req.db);
    return res.json({ success: true });
});

app.get("/api/admin/overview", requireAuth, requireOwner, (req, res) => {
    return res.json(buildAdminState(req.db));
});

app.post("/api/admin/badges", requireAuth, requireOwner, (req, res) => {
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

app.post("/api/admin/accounts/:id/toggle-badge", requireAuth, requireOwner, (req, res) => {
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

app.post("/api/admin/accounts/:id/reset-password", requireAuth, requireOwner, (req, res) => {
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

app.post("/api/admin/accounts/:id/revoke-sessions", requireAuth, requireOwner, (req, res) => {
    const account = req.db.accounts.find((entry) => entry.id === req.params.id);

    if (!account) {
        return res.status(404).json({ error: "Account not found." });
    }

    req.db.sessions = req.db.sessions.filter((session) => session.accountId !== account.id);
    writeDb(req.db);
    return res.json(buildAdminState(req.db));
});

app.get("/api/state", requireAuth, (req, res) => {
    res.json(buildClientState(req.db));
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

    if (!req.account.joinedCommunities.includes(id)) {
        req.account.joinedCommunities.unshift(id);
    }

    addNotification(db, "Community created", `${req.account.name} created ${name}.`);
    writeDb(db);
    return res.status(201).json(buildClientState(db));
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
    return res.json(buildClientState(db));
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
    return res.status(201).json(buildClientState(db));
});

app.post("/api/notifications/clear", requireAuth, (req, res) => {
    req.db.notifications = req.db.notifications.map((notification) => ({
        ...notification,
        unread: false,
    }));
    writeDb(req.db);
    return res.json(buildClientState(req.db));
});

app.post("/api/notifications/live", requireAuth, requireOwner, (req, res) => {
    const messages = [
        {
            title: "New follower request",
            body: "A member just requested to follow the active account.",
        },
        {
            title: "Community spike",
            body: "A community you joined is seeing a wave of new posts.",
        },
        {
            title: "Upload received",
            body: "A creator just shared a fresh file in the main feed.",
        },
    ];

    const next = messages[req.db.liveNotificationIndex] || messages[0];
    req.db.liveNotificationIndex = (req.db.liveNotificationIndex + 1) % messages.length;
    addNotification(req.db, next.title, next.body);
    writeDb(req.db);
    return res.json(buildClientState(req.db));
});

app.listen(PORT, () => {
    ensureDb();
    console.log(`Global Cloud server running at http://localhost:${PORT}`);
});
