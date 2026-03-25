const AUTH_TOKEN_KEY = "global-cloud-auth-token";
const RAILWAY_API_ORIGIN = "https://global-cloud-production.up.railway.app";
const USE_SAME_ORIGIN_API = ["localhost", "127.0.0.1"].includes(window.location.hostname)
    || window.location.hostname.endsWith(".railway.app");
const API_BASE = USE_SAME_ORIGIN_API ? "" : RAILWAY_API_ORIGIN;

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
    selectedDirectAccountId: "",
    selectedProfileAccountId: "",
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
    registerBirthdate: document.querySelector("#register-birthdate"),
    registerBio: document.querySelector("#register-bio"),
    registerAgeCheck: document.querySelector("#register-age-check"),
    registerTerms: document.querySelector("#register-terms"),
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
    profileContent: document.querySelector("#profile-content"),
    adminPanel: document.querySelector("#admin-panel"),
    badgeForm: document.querySelector("#badge-form"),
    badgeName: document.querySelector("#badge-name"),
    badgeColor: document.querySelector("#badge-color"),
    badgeList: document.querySelector("#badge-list"),
    adminNotificationForm: document.querySelector("#admin-notification-form"),
    adminNotificationTitle: document.querySelector("#admin-notification-title"),
    adminNotificationBody: document.querySelector("#admin-notification-body"),
    adminAccountList: document.querySelector("#admin-account-list"),
    adminReportList: document.querySelector("#admin-report-list"),
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
    dmRecipientSelect: document.querySelector("#dm-recipient-select"),
    messageList: document.querySelector("#message-list"),
    messageForm: document.querySelector("#message-form"),
    messageInput: document.querySelector("#message-input"),
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

async function copyTextToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
    }

    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "true");
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(helper);
    return copied;
}

function setAuthMode(isLoggedIn) {
    els.authScreen.hidden = isLoggedIn;
    els.appShell.hidden = !isLoggedIn;
}

function getActiveAccount() {
    return appState.accounts.find((account) => account.id === appState.activeAccountId) || null;
}

function getSelectedProfileAccount() {
    const fallbackId = appState.selectedProfileAccountId || appState.activeAccountId;
    return appState.accounts.find((account) => account.id === fallbackId) || getActiveAccount();
}

function hasAdminAccess(account) {
    return Boolean(account && (account.owner || (account.badgeIds || []).includes(MODERATOR_BADGE_ID)));
}

function isEditingField() {
    const activeElement = document.activeElement;
    if (!activeElement) {
        return false;
    }

    return Boolean(activeElement.closest(
        "input, textarea, select, [contenteditable='true'], .profile-edit-form, .comment-form, .composer-form, .stack-form, .chat-form",
    ));
}

function openProfile(accountId) {
    if (!accountId) {
        return;
    }

    appState.selectedProfileAccountId = accountId;
    renderProfile();
    document.querySelector("#profiles")?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const requestUrl = `${API_BASE}${path}`;
    let response;

    try {
        response = await fetch(requestUrl, {
            headers: {
                "Content-Type": "application/json",
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                ...(options.headers || {}),
            },
            ...options,
        });
    } catch (error) {
        throw new Error("Failed to fetch. Check that your Railway backend is live and domain is connected.");
    }

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

    appState.accounts.forEach((account) => {
        const isActive = account.id === active.id;
        const following = active.following?.includes(account.id);
        const blocked = active.blockedAccounts?.includes(account.id);
        const item = document.createElement("article");
        item.className = "account-item";
        item.innerHTML = `
            <div class="account-item-head">
                <div class="account-avatar">${escapeHtml(initialsFor(account.name))}</div>
                <div class="account-item-body">
                    <div class="name-row">
                        <h4>${escapeHtml(account.name)}</h4>
                        ${accountBadgeMarkup(account)}
                    </div>
                    <p>${escapeHtml(account.email)}</p>
                    <p>${escapeHtml(account.bio)}</p>
                    <div class="account-item-foot">
                        <span class="pill">${account.joinedCommunities.length} joined</span>
                        <span class="pill">${account.followers?.length || 0} followers</span>
                        <button class="ghost-btn" data-open-profile="${account.id}" type="button">View Profile</button>
                        ${isActive ? '<span class="pill">You</span>' : `<button class="toggle-btn ${following ? "active" : ""}" data-follow-account="${account.id}" type="button">${following ? "Following" : "Follow"}</button>`}
                        ${isActive ? "" : `<button class="ghost-btn" data-block-account="${account.id}" type="button">${blocked ? "Unblock" : "Block"}</button>`}
                        ${isActive ? "" : `<button class="ghost-btn" data-report-account="${account.id}" type="button">Report</button>`}
                    </div>
                </div>
            </div>
        `;
        els.accountList.appendChild(item);
    });
}

function renderProfile() {
    const active = getActiveAccount();
    const profile = getSelectedProfileAccount();

    if (!profile) {
        els.profileContent.innerHTML = '<div class="empty-state">Select an account to view the profile.</div>';
        return;
    }

    const communities = appState.communities.filter((community) => profile.joinedCommunities.includes(community.id));
    const allPosts = appState.posts.filter((post) => post.authorId === profile.id);
    const posts = allPosts.slice(0, 4);
    const badges = (profile.badgeIds || [])
        .map((badgeId) => appState.badges.find((badge) => badge.id === badgeId))
        .filter(Boolean);
    const isActive = active?.id === profile.id;
    const following = active?.following?.includes(profile.id);
    const blocked = active?.blockedAccounts?.includes(profile.id);

    els.profileContent.innerHTML = `
        <div class="profile-hero">
            <div class="profile-hero-main">
                <div class="profile-avatar">${escapeHtml(initialsFor(profile.name))}</div>
                <div class="profile-identity">
                    <div class="profile-name-row">
                        <h3>${escapeHtml(profile.name)}</h3>
                        ${accountBadgeMarkup(profile)}
                    </div>
                    <p class="profile-handle">${escapeHtml(profile.email)}</p>
                    <p class="profile-bio">${escapeHtml(profile.bio)}</p>
                </div>
            </div>
            <div class="profile-actions">
                ${isActive ? '<span class="status-pill">Your profile</span>' : `<button class="toggle-btn ${following ? "active" : ""}" data-follow-account="${profile.id}" type="button">${following ? "Following" : "Follow"}</button>`}
                ${isActive ? "" : `<button class="ghost-btn" data-profile-message="${profile.id}" type="button">Message</button>`}
                ${isActive ? "" : `<button class="ghost-btn" data-block-account="${profile.id}" type="button">${blocked ? "Unblock" : "Block"}</button>`}
            </div>
        </div>

        <div class="profile-stats">
            <article class="profile-stat-card">
                <strong>${allPosts.length}</strong>
                <span>Total posts</span>
            </article>
            <article class="profile-stat-card">
                <strong>${profile.followers?.length || 0}</strong>
                <span>Followers</span>
            </article>
            <article class="profile-stat-card">
                <strong>${profile.following?.length || 0}</strong>
                <span>Following</span>
            </article>
            <article class="profile-stat-card">
                <strong>${communities.length}</strong>
                <span>Communities</span>
            </article>
        </div>

        <div class="profile-grid">
            <section class="profile-card">
                <div class="section-head">
                    <div>
                        <p class="eyebrow">About</p>
                        <h4>Member overview</h4>
                    </div>
                </div>
                <div class="profile-details">
                    <p><strong>Joined spaces:</strong> ${communities.length ? communities.map((community) => escapeHtml(community.name)).join(", ") : "No communities yet."}</p>
                    <p><strong>Account role:</strong> ${profile.owner ? "Owner" : hasAdminAccess(profile) ? "Moderator" : "Member"}</p>
                    <div class="badge-chip-row">
                        ${badges.length ? badges.map((badge) => `<span class="badge-swatch ${badgeColorClass(badge.color)}">${escapeHtml(badge.name)}</span>`).join("") : '<span class="pill">No badges yet</span>'}
                    </div>
                </div>
            </section>

            <section class="profile-card">
                <div class="section-head">
                    <div>
                        <p class="eyebrow">Posts</p>
                        <h4>Recent activity</h4>
                    </div>
                </div>
                <div class="profile-post-list">
                    ${posts.length ? posts.map((post) => `
                        <article class="profile-post-item">
                            <div class="profile-post-top">
                                <span class="pill">#${escapeHtml(post.tag.replace(/\s+/g, ""))}</span>
                                <span class="profile-post-time">${escapeHtml(post.createdAt || "Just now")}</span>
                            </div>
                            <p>${escapeHtml(post.content)}</p>
                        </article>
                    `).join("") : '<div class="empty-state compact-empty">No posts from this member yet.</div>'}
                </div>
            </section>
        </div>

        ${isActive ? `
            <section class="profile-card profile-editor-card">
                <div class="section-head">
                    <div>
                        <p class="eyebrow">Edit Profile</p>
                        <h4>Update your account</h4>
                    </div>
                    <span class="status-pill">Saved live</span>
                </div>
                <form class="stack-form profile-edit-form" data-profile-edit-form="self">
                    <input name="name" type="text" maxlength="40" value="${escapeHtml(profile.name)}" placeholder="Display name">
                    <input name="email" type="email" maxlength="120" value="${escapeHtml(profile.email)}" placeholder="Email address">
                    <textarea name="bio" rows="4" maxlength="220" placeholder="Tell people about yourself">${escapeHtml(profile.bio || "")}</textarea>
                    <input name="password" type="password" minlength="8" placeholder="New password (optional)">
                    <button class="primary-btn" type="submit">Save Changes</button>
                </form>
            </section>
        ` : ""}
    `;
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

function renderAdminReports() {
    els.adminReportList.innerHTML = "";

    const reports = appState.admin?.reports || [];
    if (reports.length === 0) {
        els.adminReportList.innerHTML = '<div class="empty-state">No reports in the queue.</div>';
        return;
    }

    reports.forEach((report) => {
        const reporter = appState.accounts.find((account) => account.id === report.reporterId);
        const item = document.createElement("article");
        item.className = "admin-account-item";
        item.innerHTML = `
            <div class="admin-account-head">
                <div>
                    <div class="name-row">
                        <h4>${escapeHtml(report.targetType)} report</h4>
                        <span class="pill">${escapeHtml(report.status)}</span>
                    </div>
                    <p class="admin-account-meta">Reported by ${escapeHtml(reporter?.name || "Unknown")}</p>
                    <p class="admin-account-meta">Target: ${escapeHtml(report.targetId)}</p>
                    <p class="admin-account-meta">Reason: ${escapeHtml(report.reason)}</p>
                    <p class="admin-account-meta">${escapeHtml(report.details || "No extra details provided.")}</p>
                </div>
            </div>
            <div class="admin-account-actions">
                <button class="ghost-btn" data-report-status="${report.id}" data-report-next="reviewed" type="button">Mark Reviewed</button>
                <button class="primary-btn" data-report-status="${report.id}" data-report-next="resolved" type="button">Resolve</button>
            </div>
        `;
        els.adminReportList.appendChild(item);
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
    const active = getActiveAccount();

    appState.posts.forEach((post) => {
        const account = appState.accounts.find((entry) => entry.id === post.authorId);
        const community = post.communityId ? appState.communities.find((entry) => entry.id === post.communityId) : null;
        const comments = Array.isArray(post.comments) ? post.comments : [];
        const likedBy = Array.isArray(post.likedBy) ? post.likedBy : [];
        const liked = active ? likedBy.includes(active.id) : false;
        const article = document.createElement("article");
        article.className = "post-card";

        const uploadMarkup = post.upload
            ? `
                <div class="post-upload">
                    ${post.upload.type.startsWith("image/") ? `<img src="${post.upload.url}" alt="${escapeHtml(post.upload.name)}">` : ""}
                    ${post.upload.type.startsWith("video/") ? `<video controls preload="metadata" src="${post.upload.url}"></video>` : ""}
                    <strong>${escapeHtml(post.upload.name)}</strong>
                </div>
            `
            : "";

        article.innerHTML = `
            <div class="post-head">
                <div>
                    <div class="name-row">
                        <button class="profile-link-btn" data-open-profile="${account?.id || ""}" type="button">${escapeHtml(account?.name || "Unknown")}</button>
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
                <div class="meta-actions post-actions">
                    <button class="toggle-btn ${liked ? "active" : ""}" data-like-post="${post.id}" type="button">${liked ? "Liked" : "Like"} · ${likedBy.length}</button>
                    <span class="pill">${comments.length} comments</span>
                    <button class="ghost-btn" data-report-post="${post.id}" type="button">Report</button>
                </div>
            </div>
            <div class="comment-block">
                <div class="comment-list">
                    ${comments.length === 0 ? '<div class="empty-state compact-empty">No comments yet.</div>' : comments.map((comment) => {
                        const commentAuthor = appState.accounts.find((entry) => entry.id === comment.authorId);
                        return `
                            <article class="comment-item">
                                <div class="comment-head">
                                    <strong>${escapeHtml(commentAuthor?.name || "Unknown")}</strong>
                                    <span>${escapeHtml(comment.createdAt || "Just now")}</span>
                                </div>
                                <p>${escapeHtml(comment.content)}</p>
                            </article>
                        `;
                    }).join("")}
                </div>
                <form class="comment-form" data-comment-form="${post.id}">
                    <input type="text" maxlength="220" placeholder="Write a comment">
                    <button class="ghost-btn" type="submit">Reply</button>
                </form>
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

function renderDirectMessageOptions() {
    const active = getActiveAccount();
    const previous = appState.selectedDirectAccountId;
    const options = appState.accounts.filter((account) => active && account.id !== active.id);

    els.dmRecipientSelect.innerHTML = "";

    if (options.length === 0) {
        appState.selectedDirectAccountId = "";
        els.dmRecipientSelect.innerHTML = '<option value="">No other members yet</option>';
        els.dmRecipientSelect.disabled = true;
        return;
    }

    options.forEach((account) => {
        const option = document.createElement("option");
        option.value = account.id;
        option.textContent = `${account.name} (${account.email})`;
        els.dmRecipientSelect.appendChild(option);
    });

    appState.selectedDirectAccountId = options.some((account) => account.id === previous) ? previous : options[0].id;
    els.dmRecipientSelect.value = appState.selectedDirectAccountId;
    els.dmRecipientSelect.disabled = false;
}

function renderMessages() {
    els.messageList.innerHTML = "";
    const active = getActiveAccount();
    const selectedId = appState.selectedDirectAccountId;

    if (!active || !selectedId) {
        els.messageList.innerHTML = '<div class="empty-state">Choose another account to start a private chat.</div>';
        return;
    }

    const conversation = appState.messages.filter((message) => (
        (message.senderId === active.id && message.recipientId === selectedId)
        || (message.senderId === selectedId && message.recipientId === active.id)
    ));

    if (conversation.length === 0) {
        els.messageList.innerHTML = '<div class="empty-state">No private messages yet. Start the conversation.</div>';
        return;
    }

    conversation.forEach((message) => {
        const isOwn = message.senderId === active.id;
        const sender = appState.accounts.find((account) => account.id === message.senderId);
        const item = document.createElement("article");
        item.className = `message-card${isOwn ? " own-message" : ""}`;
        item.innerHTML = `
            <strong>${escapeHtml(sender?.name || "Unknown")}</strong>
            <p>${escapeHtml(message.body)}</p>
            <span>${escapeHtml(message.time)}</span>
        `;
        els.messageList.appendChild(item);
    });
}

function renderAll() {
    if (!appState.accounts.some((account) => account.id === appState.selectedProfileAccountId)) {
        appState.selectedProfileAccountId = appState.activeAccountId || "";
    }

    renderSidebarIdentity();
    renderStats();
    renderCommunitySelect();
    renderAccounts();
    renderProfile();
    renderBadges();
    renderAdminAccounts();
    renderAdminReports();
    renderCommunities();
    renderChatCommunityOptions();
    renderGroupChat();
    renderFeed();
    renderNotifications();
    renderDirectMessageOptions();
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

    if (!els.registerTerms.checked) {
        showToast("Agreement required", "You must accept the Terms of Use before creating an account.");
        return;
    }

    if (!els.registerAgeCheck.checked) {
        showToast("Age confirmation required", "You must confirm that you are at least 13 years old.");
        return;
    }

    if (!els.registerBirthdate.value) {
        showToast("Birth date required", "Enter your date of birth to continue.");
        return;
    }

    try {
        const result = await api("/api/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name: els.registerName.value.trim(),
                email: els.registerEmail.value.trim(),
                password: els.registerPassword.value,
                birthDate: els.registerBirthdate.value,
                bio: els.registerBio.value.trim(),
                acceptedAge13Plus: els.registerAgeCheck.checked,
                acceptedTerms: els.registerTerms.checked,
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

async function handleCreateAdminNotification(event) {
    event.preventDefault();

    const title = els.adminNotificationTitle.value.trim();
    const body = els.adminNotificationBody.value.trim();

    if (!title || !body) {
        showToast("Missing fields", "Add a title and message before sending.");
        return;
    }

    try {
        const result = await api("/api/admin/notifications", {
            method: "POST",
            body: JSON.stringify({ title, body }),
        });

        syncState(result.state);
        if (result.admin) {
            syncAdminState(result.admin);
        }
        renderAll();
        els.adminNotificationForm.reset();
        showToast("Notification sent", "Your custom notification is now live.");
    } catch (error) {
        showToast("Notification failed", error.message);
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

async function handleAccountActions(event) {
    const profileButton = event.target.closest("[data-open-profile]");
    const followButton = event.target.closest("[data-follow-account]");
    const blockButton = event.target.closest("[data-block-account]");
    const reportButton = event.target.closest("[data-report-account]");

    if (profileButton) {
        openProfile(profileButton.dataset.openProfile);
        return;
    }

    try {
        if (followButton) {
            const state = await api(`/api/accounts/${followButton.dataset.followAccount}/follow`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            syncState(state);
            renderAccounts();
            renderNotifications();
            showToast("Follow updated", "Your follow list was updated.");
            return;
        }

        if (blockButton) {
            const state = await api(`/api/accounts/${blockButton.dataset.blockAccount}/block`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            syncState(state);
            renderAll();
            showToast("Safety updated", "Your blocked account list was updated.");
            return;
        }

        if (reportButton) {
            const result = await api("/api/reports", {
                method: "POST",
                body: JSON.stringify({
                    targetType: "account",
                    targetId: reportButton.dataset.reportAccount,
                    reason: "Account safety concern",
                    details: "Reported from the account list.",
                }),
            });
            syncState(result.state);
            if (result.admin) {
                syncAdminState(result.admin);
            }
            renderAll();
            showToast("Report submitted", "The report was sent to the admin review queue.");
            return;
        }
    } catch (error) {
        showToast("Account action failed", error.message);
    }
}

async function handleFeedActions(event) {
    const profileButton = event.target.closest("[data-open-profile]");
    const likeButton = event.target.closest("[data-like-post]");
    const reportButton = event.target.closest("[data-report-post]");

    if (profileButton?.dataset.openProfile) {
        openProfile(profileButton.dataset.openProfile);
        return;
    }

    if (likeButton) {
        try {
            const state = await api(`/api/posts/${likeButton.dataset.likePost}/like`, {
                method: "POST",
                body: JSON.stringify({}),
            });
            syncState(state);
            renderFeed();
            return;
        } catch (error) {
            showToast("Like failed", error.message);
            return;
        }
    }

    if (reportButton) {
        try {
            const result = await api("/api/reports", {
                method: "POST",
                body: JSON.stringify({
                    targetType: "post",
                    targetId: reportButton.dataset.reportPost,
                    reason: "Post safety concern",
                    details: "Reported from the feed.",
                }),
            });
            syncState(result.state);
            if (result.admin) {
                syncAdminState(result.admin);
            }
            renderAll();
            showToast("Report submitted", "The report was sent to the admin review queue.");
            return;
        } catch (error) {
            showToast("Report failed", error.message);
            return;
        }
    }
}

function handleProfileActions(event) {
    const profileButton = event.target.closest("[data-open-profile]");
    const messageButton = event.target.closest("[data-profile-message]");
    const followButton = event.target.closest("[data-follow-account]");
    const blockButton = event.target.closest("[data-block-account]");

    if (profileButton?.dataset.openProfile) {
        openProfile(profileButton.dataset.openProfile);
        return;
    }

    if (messageButton?.dataset.profileMessage) {
        appState.selectedDirectAccountId = messageButton.dataset.profileMessage;
        renderDirectMessageOptions();
        els.dmRecipientSelect.value = appState.selectedDirectAccountId;
        renderMessages();
        document.querySelector("#messages")?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }

    if (followButton || blockButton) {
        handleAccountActions(event);
    }
}

async function handleProfileSubmit(event) {
    const form = event.target.closest("[data-profile-edit-form]");
    if (!form) {
        return;
    }

    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
        name: String(formData.get("name") || "").trim(),
        email: String(formData.get("email") || "").trim(),
        bio: String(formData.get("bio") || "").trim(),
        password: String(formData.get("password") || ""),
    };

    try {
        const result = await api("/api/account", {
            method: "PATCH",
            body: JSON.stringify(payload),
        });

        syncState(result.state);
        if (result.admin) {
            syncAdminState(result.admin);
        }
        appState.activeAccountId = result.account.id;
        renderAll();
        showToast("Profile updated", "Your account changes were saved.");
    } catch (error) {
        showToast("Update failed", error.message);
    }
}

async function handleCommentSubmit(event) {
    const form = event.target.closest("[data-comment-form]");
    if (!form) {
        return;
    }

    event.preventDefault();
    const input = form.querySelector("input");
    const content = input?.value.trim() || "";

    if (!content) {
        return;
    }

    try {
        const state = await api(`/api/posts/${form.dataset.commentForm}/comments`, {
            method: "POST",
            body: JSON.stringify({ content }),
        });
        syncState(state);
        renderFeed();
    } catch (error) {
        showToast("Comment failed", error.message);
    }
}

async function handleAdminActions(event) {
    const assignButton = event.target.closest("[data-assign-badge]");
    const revokeButton = event.target.closest("[data-revoke-sessions]");
    const resetButton = event.target.closest("[data-reset-password]");
    const reportButton = event.target.closest("[data-report-status]");

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
            try {
                await copyTextToClipboard(result.temporaryPassword);
                showToast("Temporary password created", "The new temp password was copied to your clipboard.");
            } catch (clipboardError) {
                console.warn("Clipboard copy failed", clipboardError);
                showToast("Temporary password created", `Copy this password manually: ${result.temporaryPassword}`);
            }
            return;
        }

        if (reportButton) {
            const admin = await api(`/api/admin/reports/${reportButton.dataset.reportStatus}/status`, {
                method: "POST",
                body: JSON.stringify({ status: reportButton.dataset.reportNext }),
            });
            syncAdminState(admin);
            renderAdminReports();
            showToast("Report updated", "The report status was updated.");
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

function handleDirectRecipientChange() {
    appState.selectedDirectAccountId = els.dmRecipientSelect.value;
    renderMessages();
}

async function handleDirectMessageSubmit(event) {
    event.preventDefault();

    const recipientId = appState.selectedDirectAccountId;
    const body = els.messageInput.value.trim();

    if (!recipientId) {
        showToast("No recipient selected", "Choose a member before sending a message.");
        return;
    }

    if (!body) {
        return;
    }

    try {
        const state = await api("/api/messages", {
            method: "POST",
            body: JSON.stringify({ recipientId, body }),
        });
        syncState(state);
        renderDirectMessageOptions();
        renderMessages();
        els.messageForm.reset();
    } catch (error) {
        showToast("Message failed", error.message);
    }
}

async function pollLiveState() {
    if (!authToken) {
        return;
    }

    if (isEditingField()) {
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
els.adminNotificationForm.addEventListener("submit", handleCreateAdminNotification);
els.communityForm.addEventListener("submit", handleCreateCommunity);
els.postForm.addEventListener("submit", handlePostSubmit);
els.postUpload.addEventListener("change", handleUploadPreview);
els.chatCommunitySelect.addEventListener("change", handleChatCommunityChange);
els.chatForm.addEventListener("submit", handleSendChatMessage);
els.dmRecipientSelect.addEventListener("change", handleDirectRecipientChange);
els.messageForm.addEventListener("submit", handleDirectMessageSubmit);
els.postContent.addEventListener("input", updateCounts);
els.notificationBell.addEventListener("click", handleClearNotifications);
els.adminAccountList.addEventListener("click", handleAdminActions);
els.adminReportList.addEventListener("click", handleAdminActions);
els.accountList.addEventListener("click", handleAccountActions);
els.profileContent.addEventListener("click", handleProfileActions);
els.profileContent.addEventListener("submit", handleProfileSubmit);
els.communityList.addEventListener("click", handleCommunityActions);
els.feedList.addEventListener("click", handleFeedActions);
els.feedList.addEventListener("submit", handleCommentSubmit);
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
