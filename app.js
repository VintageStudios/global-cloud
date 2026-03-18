const ACTIVE_ACCOUNT_KEY = "global-cloud-active-account";

const appState = {
    accounts: [],
    communities: [],
    posts: [],
    notifications: [],
    messages: [],
    liveNotificationIndex: 0,
    activeAccountId: null,
};

const els = {
    ownerName: document.querySelector("#owner-name"),
    ownerEmail: document.querySelector("#owner-email"),
    ownerAvatar: document.querySelector("#owner-avatar"),
    profileLabel: document.querySelector("#profile-label"),
    ownerRoleBadge: document.querySelector("#owner-role-badge"),
    ownerVerifiedBadge: document.querySelector("#owner-verified-badge"),
    ownerCopy: document.querySelector("#owner-copy"),
    statUsers: document.querySelector("#stat-users"),
    statCommunities: document.querySelector("#stat-communities"),
    statPosts: document.querySelector("#stat-posts"),
    currentAccountLabel: document.querySelector("#current-account-label"),
    joinedCommunityCount: document.querySelector("#joined-community-count"),
    activeAccountPill: document.querySelector("#active-account-pill"),
    composerAccount: document.querySelector("#composer-account"),
    communitySummary: document.querySelector("#community-summary"),
    accountList: document.querySelector("#account-list"),
    communityList: document.querySelector("#community-list"),
    feedList: document.querySelector("#feed-list"),
    notificationList: document.querySelector("#notification-list"),
    notificationBell: document.querySelector("#notification-bell"),
    notificationCount: document.querySelector("#notification-count"),
    notificationPanelCount: document.querySelector("#notification-panel-count"),
    messageList: document.querySelector("#message-list"),
    accountForm: document.querySelector("#account-form"),
    accountName: document.querySelector("#account-name"),
    accountEmail: document.querySelector("#account-email"),
    accountBio: document.querySelector("#account-bio"),
    communityForm: document.querySelector("#community-form"),
    communityName: document.querySelector("#community-name"),
    communityTopic: document.querySelector("#community-topic"),
    communityDescription: document.querySelector("#community-description"),
    postForm: document.querySelector("#post-form"),
    postTag: document.querySelector("#post-tag"),
    postCommunity: document.querySelector("#post-community"),
    postContent: document.querySelector("#post-content"),
    postUpload: document.querySelector("#post-upload"),
    uploadPreview: document.querySelector("#upload-preview"),
    charCount: document.querySelector("#char-count"),
    toastStack: document.querySelector("#toast-stack"),
    focusAccount: document.querySelector("#focus-account"),
    focusFeed: document.querySelector("#focus-feed"),
};

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

function initialsFor(name) {
    return String(name)
        .split(" ")
        .map((part) => part[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
}

function showToast(title, body) {
    const toast = document.createElement("article");
    toast.className = "toast";

    const heading = document.createElement("strong");
    heading.textContent = title;
    const detail = document.createElement("span");
    detail.textContent = body;

    toast.append(heading, detail);
    els.toastStack.prepend(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 4200);
}

function getAccountById(accountId) {
    return appState.accounts.find((account) => account.id === accountId);
}

function getCommunityById(communityId) {
    return appState.communities.find((community) => community.id === communityId);
}

function getActiveAccount() {
    return getAccountById(appState.activeAccountId) || appState.accounts[0];
}

function persistActiveAccount() {
    if (appState.activeAccountId) {
        window.localStorage.setItem(ACTIVE_ACCOUNT_KEY, appState.activeAccountId);
    }
}

function syncState(serverState) {
    appState.accounts = serverState.accounts || [];
    appState.communities = serverState.communities || [];
    appState.posts = serverState.posts || [];
    appState.notifications = serverState.notifications || [];
    appState.messages = serverState.messages || [];
    appState.liveNotificationIndex = serverState.liveNotificationIndex || 0;

    const storedActive = window.localStorage.getItem(ACTIVE_ACCOUNT_KEY);
    const preferredActive = storedActive && appState.accounts.some((account) => account.id === storedActive)
        ? storedActive
        : appState.accounts[0]?.id || null;

    appState.activeAccountId = preferredActive;
    persistActiveAccount();
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

async function loadState() {
    const state = await api("/api/state");
    syncState(state);
    renderAll();
}

function updateCounts() {
    els.charCount.textContent = `${els.postContent.value.length} / 280`;
}

function accountBadgeMarkup(account) {
    let markup = "";
    if (account.owner) {
        markup += '<span class="badge owner-badge">Owner</span>';
    }
    if (account.verified) {
        markup += '<span class="badge verified-badge" aria-label="Verified account">Verified</span>';
    }
    return markup;
}

function renderSidebarIdentity() {
    const active = getActiveAccount();
    if (!active) {
        return;
    }

    els.ownerName.textContent = active.name;
    els.ownerEmail.textContent = active.email;
    els.ownerAvatar.textContent = initialsFor(active.name);
    els.profileLabel.textContent = active.owner ? "Owner Account" : "Active Account";
    els.currentAccountLabel.textContent = active.name;
    els.joinedCommunityCount.textContent = active.joinedCommunities.length;
    els.activeAccountPill.textContent = `Active: ${active.name}`;
    els.composerAccount.textContent = `Posting as ${active.name}`;
    els.ownerCopy.textContent = active.bio;
    els.ownerRoleBadge.hidden = !active.owner;
    els.ownerVerifiedBadge.hidden = !active.verified;
}

function renderStats() {
    els.statUsers.textContent = appState.accounts.length;
    els.statCommunities.textContent = appState.communities.length;
    els.statPosts.textContent = appState.posts.length;
    els.communitySummary.textContent = `${appState.communities.length} communities`;
}

function renderCommunitySelect() {
    const active = getActiveAccount();
    const selectedValue = els.postCommunity.value;

    els.postCommunity.innerHTML = '<option value="">Post to everyone</option>';

    if (!active) {
        return;
    }

    appState.communities
        .filter((community) => active.joinedCommunities.includes(community.id))
        .forEach((community) => {
            const option = document.createElement("option");
            option.value = community.id;
            option.textContent = community.name;
            els.postCommunity.appendChild(option);
        });

    if ([...els.postCommunity.options].some((option) => option.value === selectedValue)) {
        els.postCommunity.value = selectedValue;
    }
}

function renderAccounts() {
    els.accountList.innerHTML = "";

    appState.accounts.forEach((account) => {
        const item = document.createElement("article");
        item.className = "account-item";
        const isActive = account.id === appState.activeAccountId;

        item.innerHTML = `
            <div class="account-item-head">
                <div class="account-avatar">${escapeHtml(initialsFor(account.name))}</div>
                <div>
                    <div class="name-row">
                        <h4>${escapeHtml(account.name)}</h4>
                        ${accountBadgeMarkup(account)}
                    </div>
                    <p>${escapeHtml(account.email)}</p>
                    <p>${escapeHtml(account.bio)}</p>
                    <span class="pill">${account.joinedCommunities.length} joined</span>
                </div>
            </div>
            <button class="toggle-btn ${isActive ? "active" : ""}" data-account-id="${account.id}" type="button">
                ${isActive ? "Active account" : "Switch to account"}
            </button>
        `;

        els.accountList.appendChild(item);
    });
}

function renderCommunities() {
    const active = getActiveAccount();
    els.communityList.innerHTML = "";

    appState.communities.forEach((community) => {
        const creator = getAccountById(community.creatorId);
        const joined = active ? active.joinedCommunities.includes(community.id) : false;
        const item = document.createElement("article");
        item.className = "community-item";

        item.innerHTML = `
            <div class="community-item-head">
                <div>
                    <div class="name-row">
                        <h4>${escapeHtml(community.name)}</h4>
                        <span class="pill">${escapeHtml(community.topic)}</span>
                    </div>
                    <p>${escapeHtml(community.description)}</p>
                </div>
            </div>
            <div class="community-item-foot">
                <span class="pill">${community.members.length} members</span>
                <span class="pill">Created by ${escapeHtml(creator?.name || "Unknown")}</span>
                <button class="join-btn ${joined ? "joined" : ""}" data-community-id="${community.id}" type="button">
                    ${joined ? "Joined" : "Join community"}
                </button>
            </div>
        `;

        els.communityList.appendChild(item);
    });
}

function renderFeed() {
    els.feedList.innerHTML = "";

    appState.posts.forEach((post) => {
        const account = getAccountById(post.authorId);
        const community = post.communityId ? getCommunityById(post.communityId) : null;
        const article = document.createElement("article");
        article.className = "post-card";

        const uploadMarkup = post.upload
            ? `
                <div class="post-upload">
                    ${post.upload.type.startsWith("image/") ? `<img src="${post.upload.url}" alt="${escapeHtml(post.upload.name)}">` : ""}
                    <strong>${escapeHtml(post.upload.name)}</strong>
                </div>
            `
            : "";

        article.innerHTML = `
            <div class="post-head">
                <div>
                    <div class="name-row">
                        <h3>${escapeHtml(account?.name || "Unknown")}</h3>
                        ${account ? accountBadgeMarkup(account) : ""}
                    </div>
                    <p class="post-subtitle">
                        ${escapeHtml(post.tag)}
                        ${community ? ` - Posted in ${escapeHtml(community.name)}` : " - Posted to everyone"}
                    </p>
                </div>
                <span class="post-timestamp">${escapeHtml(post.createdAt)}</span>
            </div>
            <p class="post-body">${escapeHtml(post.content)}</p>
            ${uploadMarkup}
            <div class="post-meta">
                <div class="name-row">
                    <span class="pill">#${escapeHtml(post.tag.replace(/\s+/g, ""))}</span>
                    ${community ? `<span class="pill">${escapeHtml(community.name)}</span>` : ""}
                </div>
                <div class="meta-actions">
                    <span class="pill">${post.likes} likes</span>
                    <span class="pill">${post.replies} replies</span>
                </div>
            </div>
        `;

        els.feedList.appendChild(article);
    });
}

function renderNotifications() {
    const unreadCount = appState.notifications.filter((notification) => notification.unread).length;
    els.notificationList.innerHTML = "";
    els.notificationCount.textContent = unreadCount;
    els.notificationPanelCount.textContent = unreadCount === 0 ? "All caught up" : `${unreadCount} unread`;

    if (appState.notifications.length === 0) {
        els.notificationList.innerHTML = '<div class="empty-state">No notifications yet.</div>';
        return;
    }

    appState.notifications.forEach((notification) => {
        const item = document.createElement("article");
        item.className = `notification-item${notification.unread ? " unread" : ""}`;
        item.innerHTML = `
            <strong>${escapeHtml(notification.title)}</strong>
            <p>${escapeHtml(notification.body)}</p>
            <span>${escapeHtml(notification.time)}</span>
        `;
        els.notificationList.appendChild(item);
    });
}

function renderMessages() {
    els.messageList.innerHTML = "";

    appState.messages.forEach((message) => {
        const item = document.createElement("article");
        item.className = "message-card";
        item.innerHTML = `
            <strong>${escapeHtml(message.sender)}</strong>
            <p>${escapeHtml(message.body)}</p>
            <span>${escapeHtml(message.time)}</span>
        `;
        els.messageList.appendChild(item);
    });
}

function renderAll() {
    renderSidebarIdentity();
    renderStats();
    renderCommunitySelect();
    renderAccounts();
    renderCommunities();
    renderFeed();
    renderNotifications();
    renderMessages();
    updateCounts();
}

async function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("File could not be read."));
        reader.readAsDataURL(file);
    });
}

async function buildUploadPayload(file) {
    if (!file) {
        return null;
    }

    return {
        name: file.name,
        type: file.type || "application/octet-stream",
        url: await readFileAsDataUrl(file),
    };
}

async function handleCreateAccount(event) {
    event.preventDefault();

    const name = els.accountName.value.trim();
    const email = els.accountEmail.value.trim();
    const bio = els.accountBio.value.trim();

    if (!name || !email) {
        showToast("Missing information", "Please add a display name and email to create an account.");
        return;
    }

    try {
        const state = await api("/api/accounts", {
            method: "POST",
            body: JSON.stringify({ name, email, bio }),
        });

        syncState(state);
        renderAll();
        els.accountForm.reset();
        showToast("Account created", `${name} is now part of Global Cloud.`);
    } catch (error) {
        showToast("Account failed", error.message);
    }
}

async function handleCreateCommunity(event) {
    event.preventDefault();

    const active = getActiveAccount();
    const name = els.communityName.value.trim();
    const topic = els.communityTopic.value.trim();
    const description = els.communityDescription.value.trim();

    if (!active) {
        showToast("No account", "Create or select an account first.");
        return;
    }

    try {
        const state = await api("/api/communities", {
            method: "POST",
            body: JSON.stringify({
                name,
                topic,
                description,
                creatorId: active.id,
            }),
        });

        syncState(state);
        renderAll();
        els.communityForm.reset();
        showToast("Community created", `${name} is now live.`);
    } catch (error) {
        showToast("Community failed", error.message);
    }
}

async function handlePostSubmit(event) {
    event.preventDefault();

    const active = getActiveAccount();
    const content = els.postContent.value.trim();
    const tag = els.postTag.value.trim() || "General";
    const communityId = els.postCommunity.value;
    const file = els.postUpload.files[0];

    if (!active) {
        showToast("No account", "Create or select an account first.");
        return;
    }

    if (!content) {
        showToast("Post is empty", "Write something before publishing.");
        return;
    }

    try {
        const upload = await buildUploadPayload(file);
        const state = await api("/api/posts", {
            method: "POST",
            body: JSON.stringify({
                authorId: active.id,
                tag,
                communityId,
                content,
                upload,
            }),
        });

        syncState(state);
        renderAll();
        els.postForm.reset();
        els.uploadPreview.textContent = "No upload selected";
        showToast("Post published", `${active.name}'s update is now live.`);
    } catch (error) {
        showToast("Post failed", error.message);
    }
}

async function handleClearNotifications() {
    try {
        const state = await api("/api/notifications/clear", {
            method: "POST",
            body: JSON.stringify({}),
        });

        syncState(state);
        renderNotifications();
        showToast("Notifications cleared", "You're all caught up for now.");
    } catch (error) {
        showToast("Clear failed", error.message);
    }
}

async function handleCommunityActions(event) {
    const button = event.target.closest("[data-community-id]");
    if (!button) {
        return;
    }

    const active = getActiveAccount();
    if (!active) {
        showToast("No account", "Create or select an account first.");
        return;
    }

    try {
        const state = await api(`/api/communities/${button.dataset.communityId}/toggle-membership`, {
            method: "POST",
            body: JSON.stringify({ accountId: active.id }),
        });

        syncState(state);
        renderAll();
    } catch (error) {
        showToast("Join failed", error.message);
    }
}

function handleAccountActions(event) {
    const button = event.target.closest("[data-account-id]");
    if (!button) {
        return;
    }

    appState.activeAccountId = button.dataset.accountId;
    persistActiveAccount();
    renderAll();

    const account = getActiveAccount();
    showToast("Account switched", `You are now posting as ${account.name}.`);
}

function handleUploadPreview() {
    const selectedFile = els.postUpload.files[0];
    els.uploadPreview.textContent = selectedFile ? `${selectedFile.name} selected` : "No upload selected";
}

async function seedLiveNotification() {
    try {
        const state = await api("/api/notifications/live", {
            method: "POST",
            body: JSON.stringify({}),
        });

        const previousCount = appState.notifications.length;
        syncState(state);
        renderNotifications();

        if (appState.notifications.length > previousCount) {
            const newest = appState.notifications[0];
            showToast(newest.title, newest.body);
        }
    } catch (error) {
        console.warn("Live notification failed", error);
    }
}

els.accountForm.addEventListener("submit", handleCreateAccount);
els.communityForm.addEventListener("submit", handleCreateCommunity);
els.postForm.addEventListener("submit", handlePostSubmit);
els.postUpload.addEventListener("change", handleUploadPreview);
els.postContent.addEventListener("input", updateCounts);
els.notificationBell.addEventListener("click", handleClearNotifications);
els.accountList.addEventListener("click", handleAccountActions);
els.communityList.addEventListener("click", handleCommunityActions);
els.focusAccount.addEventListener("click", () => {
    document.querySelector("#accounts").scrollIntoView({ behavior: "smooth" });
});
els.focusFeed.addEventListener("click", () => {
    document.querySelector("#feed").scrollIntoView({ behavior: "smooth" });
});

loadState().catch((error) => {
    showToast("Server unavailable", "Start the Node server to load Global Cloud.");
    console.error(error);
});

window.setInterval(seedLiveNotification, 18000);
