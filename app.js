const AUTH_TOKEN_KEY = "global-cloud-auth-token";

const appState = {
    accounts: [],
    badges: [],
    communities: [],
    communityMessages: {},
    posts: [],
    notifications: [],
    messages: [],
    liveNotificationIndex: 0,
    activeAccountId: null,
    admin: null,
    selectedChatCommunityId: "",
};

const els = {
    authScreen: document.querySelector("#auth-screen"),
    appShell: document.querySelector("#app-shell"),
    loginForm: document.querySelector("#login-form"),
    loginEmail: document.querySelector("#login-email"),
    loginPassword: document.querySelector("#login-password"),
    registerForm: document.querySelector("#register-form"),
    registerName: document.querySelector("#register-name"),
    registerEmail: document.querySelector("#register-email"),
    registerPassword: document.querySelector("#register-password"),
    registerBio: document.querySelector("#register-bio"),
    logoutButton: document.querySelector("#logout-button"),
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
    adminPanel: document.querySelector("#admin-panel"),
    badgeForm: document.querySelector("#badge-form"),
    badgeName: document.querySelector("#badge-name"),
    badgeColor: document.querySelector("#badge-color"),
    badgeList: document.querySelector("#badge-list"),
    adminAccountList: document.querySelector("#admin-account-list"),
    communityList: document.querySelector("#community-list"),
    chatCommunitySelect: document.querySelector("#chat-community-select"),
    chatMessages: document.querySelector("#chat-messages"),
    chatForm: document.querySelector("#chat-form"),
    chatInput: document.querySelector("#chat-input"),
    feedList: document.querySelector("#feed-list"),
    notificationList: document.querySelector("#notification-list"),
    notificationBell: document.querySelector("#notification-bell"),
    notificationCount: document.querySelector("#notification-count"),
    notificationPanelCount: document.querySelector("#notification-panel-count"),
    messageList: document.querySelector("#message-list"),
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

let authToken = window.localStorage.getItem(AUTH_TOKEN_KEY) || "";
const MODERATOR_BADGE_ID = "moderator";

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

function setAuthMode(isLoggedIn) {
    els.authScreen.hidden = isLoggedIn;
    els.appShell.hidden = !isLoggedIn;
}

function getActiveAccount() {
    return appState.accounts.find((account) => account.id === appState.activeAccountId) || null;
}

function hasAdminAccess(account) {
    return Boolean(account && (account.owner || (account.badgeIds || []).includes(MODERATOR_BADGE_ID)));
}

function syncState(serverState) {
    appState.accounts = serverState.accounts || [];
    appState.badges = serverState.badges || [];
    appState.communities = serverState.communities || [];
    appState.communityMessages = serverState.communityMessages || {};
    appState.posts = serverState.posts || [];
    appState.notifications = serverState.notifications || [];
    appState.messages = serverState.messages || [];
    appState.liveNotificationIndex = serverState.liveNotificationIndex || 0;
}

function syncAdminState(adminState) {
    appState.admin = adminState;
    if (adminState?.badges) {
        appState.badges = adminState.badges;
    }
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

    (account.badgeIds || [])
        .map((badgeId) => appState.badges.find((badge) => badge.id === badgeId))
        .filter(Boolean)
        .forEach((badge) => {
            markup += `<span class="badge-swatch ${badgeColorClass(badge.color)}">${escapeHtml(badge.name)}</span>`;
        });

    return markup;
}

async function api(path, options = {}) {
    const response = await fetch(path, {
        headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
            ...(options.headers || {}),
        },
        ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(data.error || "Request failed.");
    }

    return data;
}

function renderSidebarIdentity() {
    const active = getActiveAccount();
    if (!active) {
        return;
    }

    els.ownerName.textContent = active.name;
    els.ownerEmail.textContent = active.email;
    els.ownerAvatar.textContent = initialsFor(active.name);
    els.profileLabel.textContent = active.owner ? "Owner Account" : "Member Account";
    els.currentAccountLabel.textContent = active.name;
    els.joinedCommunityCount.textContent = active.joinedCommunities.length;
    els.activeAccountPill.textContent = `Active: ${active.name}`;
    els.composerAccount.textContent = `Posting as ${active.name}`;
    els.ownerCopy.textContent = active.bio;
    els.ownerRoleBadge.hidden = !active.owner;
    els.ownerVerifiedBadge.hidden = !active.verified;
    els.adminPanel.hidden = !hasAdminAccess(active);
}

function renderStats() {
    els.statUsers.textContent = appState.accounts.length;
    els.statCommunities.textContent = appState.communities.length;
    els.statPosts.textContent = appState.posts.length;
    els.communitySummary.textContent = `${appState.communities.length} communities`;
}

function renderCommunitySelect() {
    const active = getActiveAccount();
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
}

function renderAccounts() {
    const active = getActiveAccount();
    els.accountList.innerHTML = "";

    if (!active) {
        return;
    }

    const item = document.createElement("article");
    item.className = "account-item";
    item.innerHTML = `
        <div class="account-item-head">
            <div class="account-avatar">${escapeHtml(initialsFor(active.name))}</div>
            <div>
                <div class="name-row">
                    <h4>${escapeHtml(active.name)}</h4>
                    ${accountBadgeMarkup(active)}
                </div>
                <p>${escapeHtml(active.email)}</p>
                <p>${escapeHtml(active.bio)}</p>
                <span class="pill">${active.joinedCommunities.length} joined</span>
            </div>
        </div>
    `;
    els.accountList.appendChild(item);
}

function badgeColorClass(color) {
    const safe = String(color || "").toLowerCase();
    return ["gold", "blue", "green", "red"].includes(safe) ? `badge-color-${safe}` : "";
}

function renderBadges() {
    els.badgeList.innerHTML = "";

    if (!appState.badges.length) {
        els.badgeList.innerHTML = '<div class="empty-state">No badges created yet.</div>';
        return;
    }

    appState.badges.forEach((badge) => {
        const row = document.createElement("div");
        row.className = "badge-row";
        row.innerHTML = `
            <strong>${escapeHtml(badge.name)}</strong>
            <span class="badge-swatch ${badgeColorClass(badge.color)}">${escapeHtml(badge.color)}</span>
        `;
        els.badgeList.appendChild(row);
    });
}

function renderAdminAccounts() {
    const active = getActiveAccount();
    els.adminAccountList.innerHTML = "";

    if (!active?.owner) {
        return;
    }

    const accounts = appState.admin?.accounts || appState.accounts;

    accounts.forEach((account) => {
        const item = document.createElement("article");
        item.className = "admin-account-item";

        const options = appState.badges.map((badge) => `<option value="${badge.id}">${escapeHtml(badge.name)}</option>`).join("");
        const accountBadges = (account.badgeIds || [])
            .map((badgeId) => appState.badges.find((badge) => badge.id === badgeId))
            .filter(Boolean)
            .map((badge) => `<span class="badge-swatch ${badgeColorClass(badge.color)}">${escapeHtml(badge.name)}</span>`)
            .join("");

        item.innerHTML = `
            <div class="admin-account-head">
                <div>
                    <div class="name-row">
                        <h4>${escapeHtml(account.name)}</h4>
                        ${accountBadgeMarkup(account)}
                    </div>
                    <p class="admin-account-meta">${escapeHtml(account.email)}</p>
                    <p class="admin-account-meta">${(account.activeSessionCount ?? 0)} active sessions</p>
                </div>
                <div class="badge-chip-row">${accountBadges || '<span class="pill">No extra badges</span>'}</div>
            </div>
            <div class="admin-account-actions">
                <select class="admin-select" data-badge-account="${account.id}">
                    <option value="">Select badge</option>
                    ${options}
                </select>
                <button class="ghost-btn" data-assign-badge="${account.id}" type="button">Toggle Badge</button>
                <button class="ghost-btn" data-revoke-sessions="${account.id}" type="button">Revoke Sessions</button>
                <button class="primary-btn" data-reset-password="${account.id}" type="button">Temp Password</button>
            </div>
        `;

        els.adminAccountList.appendChild(item);
    });
}

function renderCommunities() {
    const active = getActiveAccount();
    els.communityList.innerHTML = "";

    appState.communities.forEach((community) => {
        const creator = appState.accounts.find((account) => account.id === community.creatorId);
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

function renderChatCommunityOptions() {
    const active = getActiveAccount();
    const joined = appState.communities.filter((community) => active?.joinedCommunities.includes(community.id));
    const previous = appState.selectedChatCommunityId;

    els.chatCommunitySelect.innerHTML = "";

    joined.forEach((community) => {
        const option = document.createElement("option");
        option.value = community.id;
        option.textContent = community.name;
        els.chatCommunitySelect.appendChild(option);
    });

    if (joined.length === 0) {
        appState.selectedChatCommunityId = "";
        els.chatCommunitySelect.innerHTML = '<option value="">No joined communities</option>';
        els.chatCommunitySelect.disabled = true;
        return;
    }

    els.chatCommunitySelect.disabled = false;
    appState.selectedChatCommunityId = joined.some((community) => community.id === previous)
        ? previous
        : joined[0].id;
    els.chatCommunitySelect.value = appState.selectedChatCommunityId;
}

function renderGroupChat() {
    els.chatMessages.innerHTML = "";
    const communityId = appState.selectedChatCommunityId;

    if (!communityId) {
        els.chatMessages.innerHTML = '<div class="empty-state">Join a community to start group chat.</div>';
        return;
    }

    const messages = appState.communityMessages[communityId] || [];
    if (messages.length === 0) {
        els.chatMessages.innerHTML = '<div class="empty-state">No messages yet. Start the conversation.</div>';
        return;
    }

    messages.forEach((message) => {
        const author = appState.accounts.find((account) => account.id === message.authorId);
        const row = document.createElement("article");
        row.className = "chat-message";
        row.innerHTML = `
            <div class="chat-message-head">
                <strong>${escapeHtml(author?.name || "Unknown")}</strong>
                <span>${escapeHtml(message.createdAt || "Just now")}</span>
            </div>
            <p>${escapeHtml(message.content)}</p>
        `;
        els.chatMessages.appendChild(row);
    });

    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
}

function renderFeed() {
    els.feedList.innerHTML = "";

    appState.posts.forEach((post) => {
        const account = appState.accounts.find((entry) => entry.id === post.authorId);
        const community = post.communityId ? appState.communities.find((entry) => entry.id === post.communityId) : null;
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
    renderBadges();
    renderAdminAccounts();
    renderCommunities();
    renderChatCommunityOptions();
    renderGroupChat();
    renderFeed();
    renderNotifications();
    renderMessages();
    updateCounts();
}

function setAuthenticatedSession(token, account, state) {
    authToken = token;
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    syncState(state);
    appState.activeAccountId = account.id;
    setAuthMode(true);
    renderAll();
}

function clearAuthenticatedSession() {
    authToken = "";
    appState.accounts = [];
    appState.communities = [];
    appState.posts = [];
    appState.notifications = [];
    appState.messages = [];
    appState.activeAccountId = null;
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
    setAuthMode(false);
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

async function refreshState() {
    const state = await api("/api/state");
    syncState(state);
    if (hasAdminAccess(getActiveAccount())) {
        const admin = await api("/api/admin/overview");
        syncAdminState(admin);
    }
    renderAll();
}

async function handleLogin(event) {
    event.preventDefault();

    try {
        const result = await api("/api/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: els.loginEmail.value.trim(),
                password: els.loginPassword.value,
            }),
        });

        setAuthenticatedSession(result.token, result.account, result.state);
        if (hasAdminAccess(result.account)) {
            syncAdminState(await api("/api/admin/overview"));
            renderAll();
        }
        els.loginForm.reset();
        showToast("Logged in", `Welcome back, ${result.account.name}.`);
    } catch (error) {
        showToast("Login failed", error.message);
    }
}

async function handleRegister(event) {
    event.preventDefault();

    try {
        const result = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name: els.registerName.value.trim(),
                email: els.registerEmail.value.trim(),
                password: els.registerPassword.value,
                bio: els.registerBio.value.trim(),
            }),
        });

        setAuthenticatedSession(result.token, result.account, result.state);
        els.registerForm.reset();
        showToast("Account created", `${result.account.name} is now signed in.`);
    } catch (error) {
        showToast("Registration failed", error.message);
    }
}

async function handleLogout() {
    try {
        if (authToken) {
            await api("/api/auth/logout", {
                method: "POST",
                body: JSON.stringify({}),
            });
        }
    } catch (error) {
        console.warn("Logout failed", error);
    }

    clearAuthenticatedSession();
    showToast("Logged out", "You have been signed out.");
}

async function handleCreateCommunity(event) {
    event.preventDefault();

    try {
        const state = await api("/api/communities", {
            method: "POST",
            body: JSON.stringify({
                name: els.communityName.value.trim(),
                topic: els.communityTopic.value.trim(),
                description: els.communityDescription.value.trim(),
            }),
        });

        syncState(state);
        renderAll();
        els.communityForm.reset();
        showToast("Community created", "Your new community is live.");
    } catch (error) {
        showToast("Community failed", error.message);
    }
}

async function handleCreateBadge(event) {
    event.preventDefault();
    const name = els.badgeName.value.trim();
    if (!name) {
        showToast("Badge name required", "Add a badge name before creating.");
        return;
    }

    try {
        const admin = await api("/api/admin/badges", {
            method: "POST",
            body: JSON.stringify({
                name,
                color: els.badgeColor.value.trim() || "blue",
            }),
        });

        syncAdminState(admin);
        renderBadges();
        renderAdminAccounts();
        els.badgeForm.reset();
        showToast("Badge created", "The new badge is ready to assign.");
    } catch (error) {
        showToast("Badge failed", error.message);
    }
}

async function handlePostSubmit(event) {
    event.preventDefault();

    const content = els.postContent.value.trim();
    if (!content) {
        showToast("Post is empty", "Write something before publishing.");
        return;
    }

    try {
        const upload = await buildUploadPayload(els.postUpload.files[0]);
        const state = await api("/api/posts", {
            method: "POST",
            body: JSON.stringify({
                tag: els.postTag.value.trim() || "General",
                communityId: els.postCommunity.value,
                content,
                upload,
            }),
        });

        syncState(state);
        renderAll();
        els.postForm.reset();
        els.uploadPreview.textContent = "No upload selected";
        showToast("Post published", "Your update is now live.");
    } catch (error) {
        showToast("Post failed", error.message);
    }
}

async function handleSendChatMessage(event) {
    event.preventDefault();

    const content = els.chatInput.value.trim();
    const communityId = appState.selectedChatCommunityId;

    if (!communityId) {
        showToast("No community selected", "Join a community before sending chat messages.");
        return;
    }

    if (!content) {
        return;
    }

    try {
        const state = await api(`/api/communities/${communityId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content }),
        });

        syncState(state);
        renderChatCommunityOptions();
        renderGroupChat();
        els.chatInput.value = "";
    } catch (error) {
        showToast("Chat failed", error.message);
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

    try {
        const state = await api(`/api/communities/${button.dataset.communityId}/toggle-membership`, {
            method: "POST",
            body: JSON.stringify({}),
        });

        syncState(state);
        renderAll();
    } catch (error) {
        showToast("Community update failed", error.message);
    }
}

async function handleAdminActions(event) {
    const assignButton = event.target.closest("[data-assign-badge]");
    const revokeButton = event.target.closest("[data-revoke-sessions]");
    const resetButton = event.target.closest("[data-reset-password]");

    try {
        if (assignButton) {
            const accountId = assignButton.dataset.assignBadge;
            const select = document.querySelector(`[data-badge-account="${accountId}"]`);
            if (!select?.value) {
                showToast("Select a badge", "Choose a badge before assigning it.");
                return;
            }

            const admin = await api(`/api/admin/accounts/${accountId}/toggle-badge`, {
                method: "POST",
                body: JSON.stringify({ badgeId: select.value }),
            });
            syncAdminState(admin);
            renderAdminAccounts();
            renderBadges();
            showToast("Badge updated", "The badge assignment was updated.");
            return;
        }

        if (revokeButton) {
            const admin = await api(`/api/admin/accounts/${revokeButton.dataset.revokeSessions}/revoke-sessions`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            syncAdminState(admin);
            renderAdminAccounts();
            showToast("Sessions revoked", "That account has been signed out everywhere.");
            return;
        }

        if (resetButton) {
            const result = await api(`/api/admin/accounts/${resetButton.dataset.resetPassword}/reset-password`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            syncAdminState(result.admin);
            renderAdminAccounts();
            showToast("Temporary password created", `New temporary password: ${result.temporaryPassword}`);
        }
    } catch (error) {
        showToast("Admin action failed", error.message);
    }
}

function handleUploadPreview() {
    const selectedFile = els.postUpload.files[0];
    els.uploadPreview.textContent = selectedFile ? `${selectedFile.name} selected` : "No upload selected";
}

function handleChatCommunityChange() {
    appState.selectedChatCommunityId = els.chatCommunitySelect.value;
    renderGroupChat();
}

async function seedLiveNotification() {
    if (!authToken) {
        return;
    }

    try {
        const active = getActiveAccount();

        if (!active) {
            return;
        }

        if (active.owner) {
            const previousCount = appState.notifications.length;
            const state = await api("/api/notifications/live", {
                method: "POST",
                body: JSON.stringify({}),
            });

            syncState(state);
            const admin = await api("/api/admin/overview");
            syncAdminState(admin);
            renderAll();

            if (appState.notifications.length > previousCount) {
                const newest = appState.notifications[0];
                showToast(newest.title, newest.body);
            }
            return;
        }

        await refreshState();
    } catch (error) {
        if (String(error.message).includes("Authentication required")) {
            clearAuthenticatedSession();
        }
    }
}

async function pollLiveState() {
    if (!authToken) {
        return;
    }

    try {
        await refreshState();
    } catch (error) {
        if (String(error.message).includes("Authentication required")) {
            clearAuthenticatedSession();
        }
    }
}

async function bootstrap() {
    setAuthMode(false);

    if (!authToken) {
        return;
    }

    try {
        const result = await api("/api/auth/me");
        syncState(result.state);
        appState.activeAccountId = result.account.id;
        if (hasAdminAccess(result.account)) {
            syncAdminState(await api("/api/admin/overview"));
        }
        setAuthMode(true);
        renderAll();
    } catch (error) {
        clearAuthenticatedSession();
    }
}

els.loginForm.addEventListener("submit", handleLogin);
els.registerForm.addEventListener("submit", handleRegister);
els.logoutButton.addEventListener("click", handleLogout);
els.badgeForm.addEventListener("submit", handleCreateBadge);
els.communityForm.addEventListener("submit", handleCreateCommunity);
els.postForm.addEventListener("submit", handlePostSubmit);
els.postUpload.addEventListener("change", handleUploadPreview);
els.chatCommunitySelect.addEventListener("change", handleChatCommunityChange);
els.chatForm.addEventListener("submit", handleSendChatMessage);
els.postContent.addEventListener("input", updateCounts);
els.notificationBell.addEventListener("click", handleClearNotifications);
els.adminAccountList.addEventListener("click", handleAdminActions);
els.communityList.addEventListener("click", handleCommunityActions);
els.focusAccount.addEventListener("click", () => {
    document.querySelector("#communities").scrollIntoView({ behavior: "smooth" });
});
els.focusFeed.addEventListener("click", () => {
    document.querySelector("#feed").scrollIntoView({ behavior: "smooth" });
});

bootstrap().catch((error) => {
    console.error(error);
    showToast("Startup failed", "The app could not initialize.");
});

window.setInterval(pollLiveState, 8000);
window.setInterval(seedLiveNotification, 18000);
