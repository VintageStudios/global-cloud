const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DATA_DIR, "global-cloud-db.json");

const defaultDb = {
    accounts: [
        {
            id: "owner-odell",
            name: "Odell",
            email: "odell8933@gmail.com",
            bio: "Platform founder and primary administrator.",
            owner: true,
            verified: true,
            joinedCommunities: ["cloud-makers", "signal-lab"],
        },
        {
            id: "mateo-rivera",
            name: "Mateo Rivera",
            email: "mateo@example.com",
            bio: "Travel creator building with local voices.",
            owner: false,
            verified: false,
            joinedCommunities: ["world-lens"],
        },
        {
            id: "priya-sol",
            name: "Priya Sol",
            email: "priya@example.com",
            bio: "AI research and future social systems.",
            owner: false,
            verified: false,
            joinedCommunities: ["signal-lab"],
        },
        {
            id: "leila-hassan",
            name: "Leila Hassan",
            email: "leila@example.com",
            bio: "Community organizer and event host.",
            owner: false,
            verified: false,
            joinedCommunities: ["cloud-makers"],
        },
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
    liveNotificationIndex: 0,
};

function ensureDb() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(defaultDb, null, 2));
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

app.use(express.json({ limit: "10mb" }));
app.use(express.static(__dirname));

app.get("/api/state", (req, res) => {
    res.json(readDb());
});

app.post("/api/accounts", (req, res) => {
    const db = readDb();
    const { name, email, bio } = req.body;

    if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required." });
    }

    const id = slugify(name);
    const exists = db.accounts.some(
        (account) => account.id === id || account.email.toLowerCase() === String(email).toLowerCase(),
    );

    if (exists) {
        return res.status(409).json({ error: "That account already exists." });
    }

    db.accounts.push({
        id,
        name,
        email,
        bio: bio || "New Global Cloud member.",
        owner: false,
        verified: false,
        joinedCommunities: [],
    });

    addNotification(db, "New account created", `${name} can now post and join communities.`);
    writeDb(db);
    return res.status(201).json(db);
});

app.post("/api/communities", (req, res) => {
    const db = readDb();
    const { name, topic, description, creatorId } = req.body;

    if (!name || !topic || !description || !creatorId) {
        return res.status(400).json({ error: "Missing community fields." });
    }

    const creator = db.accounts.find((account) => account.id === creatorId);
    if (!creator) {
        return res.status(404).json({ error: "Creator account not found." });
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
        creatorId,
        members: [creatorId],
    });

    if (!creator.joinedCommunities.includes(id)) {
        creator.joinedCommunities.unshift(id);
    }

    addNotification(db, "Community created", `${creator.name} created ${name}.`);
    writeDb(db);
    return res.status(201).json(db);
});

app.post("/api/communities/:id/toggle-membership", (req, res) => {
    const db = readDb();
    const community = db.communities.find((entry) => entry.id === req.params.id);
    const { accountId } = req.body;
    const account = db.accounts.find((entry) => entry.id === accountId);

    if (!community || !account) {
        return res.status(404).json({ error: "Community or account not found." });
    }

    const joinedIndex = account.joinedCommunities.indexOf(community.id);
    if (joinedIndex >= 0) {
        account.joinedCommunities.splice(joinedIndex, 1);
        community.members = community.members.filter((memberId) => memberId !== accountId);
        addNotification(db, "Community left", `${account.name} left ${community.name}.`);
    } else {
        account.joinedCommunities.unshift(community.id);
        if (!community.members.includes(accountId)) {
            community.members.push(accountId);
        }
        addNotification(db, "Community joined", `${account.name} joined ${community.name}.`);
    }

    writeDb(db);
    return res.json(db);
});

app.post("/api/posts", (req, res) => {
    const db = readDb();
    const { authorId, tag, communityId, content, upload } = req.body;
    const author = db.accounts.find((account) => account.id === authorId);

    if (!author || !content) {
        return res.status(400).json({ error: "Author and content are required." });
    }

    db.posts.unshift({
        id: `post-${Date.now()}`,
        authorId,
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

    addNotification(db, "Post published", `${author.name} shared a post to ${destination}.`);
    writeDb(db);
    return res.status(201).json(db);
});

app.post("/api/notifications/clear", (req, res) => {
    const db = readDb();
    db.notifications = db.notifications.map((notification) => ({
        ...notification,
        unread: false,
    }));
    writeDb(db);
    return res.json(db);
});

app.post("/api/notifications/live", (req, res) => {
    const db = readDb();
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

    const next = messages[db.liveNotificationIndex] || messages[0];
    db.liveNotificationIndex = (db.liveNotificationIndex + 1) % messages.length;
    addNotification(db, next.title, next.body);
    writeDb(db);
    return res.json(db);
});

app.listen(PORT, () => {
    ensureDb();
    console.log(`Global Cloud server running at http://localhost:${PORT}`);
});
