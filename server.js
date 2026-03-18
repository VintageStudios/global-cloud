const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "global-cloud-db.json");
const OWNER_TEMP_PASSWORD = "GlobalCloudOwner2026!";

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
            joinedCommunities: ["cloud-makers", "signal-lab"],
            passwordHash: hashPassword(OWNER_TEMP_PASSWORD),
        }),
        baseAccount({
            id: "mateo-rivera",
            name: "Mateo Rivera",
            email: "mateo@example.com",
            bio: "Travel creator building with local voices.",
            owner: false,
            verified: false,
            joinedCommunities: ["world-lens"],
            passwordHash: hashPassword("MateoDemo2026!"),
        }),
        baseAccount({
            id: "priya-sol",
            name: "Priya Sol",
            email: "priya@example.com",
            bio: "AI research and future social systems.",
            owner: false,
            verified: false,
            joinedCommunities: ["signal-lab"],
            passwordHash: hashPassword("PriyaDemo2026!"),
        }),
        baseAccount({
            id: "leila-hassan",
            name: "Leila Hassan",
            email: "leila@example.com",
            bio: "Community organizer and event host.",
            owner: false,
            verified: false,
            joinedCommunities: ["cloud-makers"],
            passwordHash: hashPassword("LeilaDemo2026!"),
        }),
    ],
    communities: [
        {
            id: "cloud-makers",
            name: "Cloud Makers",
            topic: "Product Building",
            description: "Designers and developers shipping openly together.",
            creatorId: "owner-odell",
            members: ["owner-odell", "leila-hassan"],
        },
        {
            id: "world-lens",
            name: "World Lens",
            topic: "Photography",
            description: "Photographers documenting everyday life around the world.",
            creatorId: "mateo-rivera",
            members: ["mateo-rivera"],
        },
        {
            id: "signal-lab",
            name: "Signal Lab",
            topic: "Research",
            description: "Analysts tracking tech, media, and culture shifts.",
            creatorId: "priya-sol",
            members: ["owner-odell", "priya-sol"],
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
        {
            id: "post-mateo",
            authorId: "mateo-rivera",
            tag: "Local Voices",
            communityId: "world-lens",
            content: "Testing a new format where every destination guide is co-written by locals. Global perspective beats tourist perspective every time.",
            createdAt: "18m ago",
            upload: null,
            likes: 984,
            replies: 203,
        },
        {
            id: "post-priya",
            authorId: "priya-sol",
            tag: "Future Social",
            communityId: "signal-lab",
            content: "Imagine a social platform that highlights useful ideas instead of outrage. Better discovery, richer context, stronger communities.",
            createdAt: "34m ago",
            upload: null,
            likes: 2400,
            replies: 1100,
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
    messages: [
        {
            id: "msg-1",
            sender: "Leila Hassan",
            body: "The Berlin meetup page is live. Want me to pin it to the community hub?",
            time: "7 min ago",
        },
        {
            id: "msg-2",
            sender: "Owen Park",
            body: "Your concept post was featured in Discover. Comments are moving fast.",
            time: "19 min ago",
        },
    ],
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

app.post("/api/notifications/live", requireAuth, (req, res) => {
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
