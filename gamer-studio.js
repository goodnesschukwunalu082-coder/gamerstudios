import {
  createPost,
  createPostComment,
  createGroupChat,
  clearOldReadNotifications,
  deleteReadAppInstallNotification,
  deleteDirectMessage,
  deleteGroupMessage,
  deletePost,
  getDirectMessages,
  getAcceptedFriends,
  getFriendshipStatus,
  getGroupConversations,
  getGroupMessages,
  getMessageContacts,
  getMessageConversations,
  getMessageProfile,
  hideMessageConversation,
  getNotifications,
  getPostComments,
  getPosts,
  markAllNotificationsRead,
  markAllDirectMessagesRead,
  markNotificationRead,
  refreshVoiceNoteUrl,
  respondToFriendRequest,
  sendFriendRequest,
  uploadGroupPicture,
  sendDirectMediaMessage,
  sendDirectMessageReply,
  sendDirectVoiceMessage,
  sendGroupMediaMessage,
  sendGroupMessage,
  sendGroupVoiceMessage,
  signOutUser,
  toggleFollow,
  toggleDirectMessageReaction,
  toggleGroupMessageReaction,
  togglePostLike,
  uploadProfileBackground,
  uploadProfilePicture,
  updateDirectMessage,
  updateDisplayName,
  updateProfileStatus
} from './gamer-studio auth.js?v=27';
import { supabase } from './supabase-client.js';
const secondProfile = document.getElementById('header222');
const TEXT1 = document.getElementById('text1');
const TEXT = document.getElementById('text');
const RECENT = document.getElementById('recent');
const SIGNUP_NAME = document.getElementById('signup-name');
const USERNAME = document.getElementById('user_name');
const FULLNAME = document.getElementById('full_name');
const PROFILE_MENU_PICTURE = document.getElementById('profile-menu-picture');
let profilePhotoURL = '';
const SETTINGS_STORAGE_KEY = 'gamer-studio-settings';
const DEFAULT_SETTINGS = {
  socialNotifications: true,
  messageNotifications: true,
  showOnlineStatus: true,
  appearance: 'dark'
};

function loadAppSettings() {
  try {
    const storedSettings = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || '{}');
    return {
      ...DEFAULT_SETTINGS,
      ...storedSettings,
      appearance: storedSettings.appearance === 'light' ? 'light' : 'dark'
    };
  } catch (error) {
    console.error('Unable to load settings:', error);
    return { ...DEFAULT_SETTINGS };
  }
}

let appSettings = loadAppSettings();

function saveAppSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(appSettings));
  } catch (error) {
    console.error('Unable to save settings:', error);
    throw new Error('Your setting could not be saved in this browser.');
  }
}

function applyAppearance() {
  document.documentElement.dataset.theme = appSettings.appearance;
}

applyAppearance();

function applyProfilePicture(photoURL) {
  profilePhotoURL = photoURL || '';

  document.querySelectorAll(
    '#header-profile-picture, #sidebar-profile-picture, #profile-menu-picture, .profile-avatar-image'
  ).forEach((image) => {
    if (profilePhotoURL) {
      image.src = profilePhotoURL;
    } else {
      image.removeAttribute('src');
    }
    image.hidden = !profilePhotoURL;
  });

  PROFILE_MENU_PICTURE?.closest('.lines')
    ?.classList.toggle('has-profile-picture', Boolean(profilePhotoURL));
  if (USERNAME) USERNAME.hidden = Boolean(profilePhotoURL);
  if (secondProfile) secondProfile.hidden = Boolean(profilePhotoURL);
}

function showFirstLetter() {
  const name = SIGNUP_NAME?.value.trim() || localStorage.getItem('gamerName') || '';
  const firstLetter = name.charAt(0).toUpperCase() || 'G';
  if (USERNAME) USERNAME.textContent = firstLetter;
  if (FULLNAME) FULLNAME.textContent = name;
  if (secondProfile) secondProfile.textContent = firstLetter;
  applyProfilePicture(profilePhotoURL);
}

window.addEventListener('gamer-profile-updated', (event) => {
  const name = event.detail?.name || '';
  const firstLetter = name.charAt(0).toUpperCase() || 'G';
  if (USERNAME) USERNAME.textContent = firstLetter;
  if (FULLNAME) FULLNAME.textContent = name;
  if (secondProfile) secondProfile.textContent = firstLetter;
  if (event.detail && 'photoURL' in event.detail) {
    applyProfilePicture(event.detail.photoURL);
  }
});

if (SIGNUP_NAME) {
  SIGNUP_NAME.addEventListener('input', () => {
    localStorage.setItem('gamerName', SIGNUP_NAME.value.trim());
    showFirstLetter();
  });
}

PROFILE_MENU_PICTURE?.addEventListener('error', () => {
  PROFILE_MENU_PICTURE.hidden = true;
  PROFILE_MENU_PICTURE.closest('.lines')?.classList.remove('has-profile-picture');
});

showFirstLetter();

const notificationBell = document.getElementById('notification-bell');
const notificationPanel = document.getElementById('notification-panel');
const notificationCount = document.getElementById('notification-count');
const notificationList = document.getElementById('notification-list');
const notificationStatus = document.getElementById('notification-status');
const markAllNotificationsButton = document.getElementById('mark-all-notifications-read');
const notificationMenu = document.getElementById('notification-menu');
let notificationChannel;
let notificationUserId;
let directMessageNotificationChannel;
let notificationCleanupWarningShown = false;
let deferredInstallPrompt = null;
let installPromptDialog = null;
let shownInstallNotificationId = null;
let incomingMessageBanner;
let incomingMessageBannerTimer = 0;
const notifiedMessageIds = new Set();

function getDirectMessagePreview(message) {
  if (message.content) return message.content.slice(0, 140);
  if (message.voice_path) return 'Sent you a voice message';
  if (message.media_type === 'video') return 'Shared a video';
  if (message.media_path) return 'Shared a photo';
  return 'Sent you a message';
}

function hideIncomingMessageBanner() {
  window.clearTimeout(incomingMessageBannerTimer);
  incomingMessageBanner?.classList.remove('is-visible');
  incomingMessageBanner?.setAttribute('aria-hidden', 'true');
  if (incomingMessageBanner) incomingMessageBanner.tabIndex = -1;
}

function showIncomingMessageBanner(profile, message) {
  if (!appSettings.messageNotifications || document.visibilityState !== 'visible') return;
  if (!incomingMessageBanner) {
    incomingMessageBanner = document.createElement('button');
    incomingMessageBanner.type = 'button';
    incomingMessageBanner.className = 'incoming-message-banner';
    incomingMessageBanner.setAttribute('aria-live', 'polite');
    incomingMessageBanner.setAttribute('aria-hidden', 'true');
    incomingMessageBanner.tabIndex = -1;
    document.body.append(incomingMessageBanner);
  }

  const avatar = document.createElement('span');
  avatar.className = 'incoming-message-avatar';
  if (profile.avatar_url) {
    const image = document.createElement('img');
    image.src = profile.avatar_url;
    image.alt = '';
    image.addEventListener('error', () => {
      image.remove();
      avatar.textContent = (profile.username || 'G').charAt(0).toUpperCase();
    }, { once: true });
    avatar.append(image);
  } else {
    avatar.textContent = (profile.username || 'G').charAt(0).toUpperCase();
  }

  const copy = document.createElement('span');
  copy.className = 'incoming-message-copy';
  const name = document.createElement('span');
  name.className = 'incoming-message-name';
  name.textContent = profile.username || 'Gamer';
  const preview = document.createElement('span');
  preview.className = 'incoming-message-preview';
  preview.textContent = getDirectMessagePreview(message);
  copy.append(name, preview);
  incomingMessageBanner.replaceChildren(avatar, copy);
  incomingMessageBanner.setAttribute(
    'aria-label',
    `New message from ${profile.username || 'Gamer'}: ${preview.textContent}`
  );
  incomingMessageBanner.setAttribute('aria-hidden', 'false');
  incomingMessageBanner.tabIndex = 0;
  incomingMessageBanner.classList.add('is-visible');
  window.clearTimeout(incomingMessageBannerTimer);
  incomingMessageBannerTimer = window.setTimeout(hideIncomingMessageBanner, 5500);

  incomingMessageBanner.onclick = () => {
    hideIncomingMessageBanner();
    setActiveMenuItem(MESSAGES_MENU_ITEM);
    showMessages(profile.id).catch((error) => {
      console.error('Unable to open chat from the message banner:', error);
      showSectionView('Messages', error.message || 'This conversation could not be opened.');
    });
  };
}

async function handleIncomingDirectMessage(payload) {
  const message = payload.new;
  if (
    !message?.id
    || !message.sender_id
    || message.sender_id === notificationUserId
    || notifiedMessageIds.has(message.id)
  ) return;

  notifiedMessageIds.add(message.id);
  if (notifiedMessageIds.size > 100) {
    notifiedMessageIds.delete(notifiedMessageIds.values().next().value);
  }

  let profile;
  try {
    profile = await getMessageProfile(message.sender_id);
  } catch (error) {
    console.error('Unable to load the sender profile for a message notification:', error);
    profile = { id: message.sender_id, username: 'Gamer', avatar_url: '' };
  }
  showIncomingMessageBanner(profile, message);
}

function getPushApplicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function getPushServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported by this browser.');
  }
  return navigator.serviceWorker.ready;
}

async function enablePhoneNotifications() {
  if (!notificationUserId) {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in before enabling phone notifications.');
    notificationUserId = data.user.id;
  }
  if (!window.isSecureContext) {
    throw new Error('Phone notifications require HTTPS. Open the deployed Gamer Studio site.');
  }
  if (!('Notification' in window)) {
    throw new Error('This browser does not support phone notifications.');
  }

  const permission = Notification.permission === 'default'
    ? await Notification.requestPermission()
    : Notification.permission;
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked in this browser. Allow them in the browser or device settings first.'
      : 'Notification permission was not granted.');
  }

  const registration = await getPushServiceWorker();
  const configResponse = await fetch('/.netlify/functions/push-config', {
    cache: 'no-store'
  });
  let config;
  try {
    config = await configResponse.json();
  } catch (error) {
    throw new Error('The phone notification service returned invalid configuration.', { cause: error });
  }
  if (!configResponse.ok || typeof config.publicKey !== 'string' || !config.publicKey) {
    throw new Error(config.error || 'Phone notifications are not configured on the server yet.');
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: getPushApplicationServerKey(config.publicKey)
  });
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: notificationUserId,
      endpoint: subscription.endpoint,
      subscription: subscription.toJSON()
    }, { onConflict: 'endpoint' });
  if (error) {
    await subscription.unsubscribe();
    throw error;
  }
  return subscription;
}

async function disablePhoneNotifications() {
  if (!notificationUserId) {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error('Sign in before changing phone notifications.');
    notificationUserId = data.user.id;
  }
  const registration = await getPushServiceWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)
    .eq('user_id', notificationUserId);
  if (error) throw error;
  const unsubscribed = await subscription.unsubscribe();
  if (!unsubscribed) {
    throw new Error('The saved device subscription was removed, but the browser could not unsubscribe.');
  }
}

async function hasPhoneNotificationSubscription() {
  const registration = await getPushServiceWorker();
  return Boolean(await registration.pushManager.getSubscription());
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
});

function showInstallPrompt(notification) {
  if (!notification || shownInstallNotificationId === notification.id) return;
  shownInstallNotificationId = notification.id;

  if (!installPromptDialog) {
    installPromptDialog = document.createElement('dialog');
    installPromptDialog.className = 'app-install-dialog';
    const heading = document.createElement('h2');
    heading.textContent = 'Install Gamer Studio?';
    const copy = document.createElement('p');
    copy.className = 'app-install-copy';
    copy.textContent = 'Add Gamer Studio to your device for quicker access. Installation is optional.';
    const help = document.createElement('p');
    help.className = 'app-install-help';
    help.hidden = true;
    const actions = document.createElement('div');
    actions.className = 'app-install-actions';
    const installButton = document.createElement('button');
    installButton.type = 'button';
    installButton.className = 'app-install-primary';
    installButton.textContent = deferredInstallPrompt ? 'Install app' : 'How to install';
    const laterButton = document.createElement('button');
    laterButton.type = 'button';
    laterButton.className = 'app-install-later';
    laterButton.textContent = 'Not now';
    actions.append(installButton, laterButton);
    installPromptDialog.append(heading, copy, help, actions);
    installPromptDialog.addEventListener('cancel', (event) => event.preventDefault());
    document.body.appendChild(installPromptDialog);
  }

  const installButton = installPromptDialog.querySelector('.app-install-primary');
  const laterButton = installPromptDialog.querySelector('.app-install-later');
  const help = installPromptDialog.querySelector('.app-install-help');
  let instructionsShown = false;
  installButton.textContent = deferredInstallPrompt ? 'Install app' : 'How to install';
  help.hidden = true;
  installPromptDialog.showModal();

  const finishPrompt = async () => {
    installButton.disabled = true;
    laterButton.disabled = true;
    try {
      await markNotificationRead(notification.id);
    } catch (error) {
      console.error('Unable to mark the app-install notification as read:', error);
      help.textContent = 'Your choice could not be saved. Check your connection and try again.';
      help.hidden = false;
      installButton.disabled = false;
      laterButton.disabled = false;
      return;
    }
    installPromptDialog.close();
    await new Promise((resolve) => window.setTimeout(resolve, 5 * 60 * 1000));
    try {
      await deleteReadAppInstallNotification(notification.id);
      await refreshNotifications();
    } catch (error) {
      console.error('Unable to delete the read app-install notification:', error);
      await refreshNotifications();
      notificationPanel.hidden = false;
      notificationBell.setAttribute('aria-expanded', 'true');
      showNotificationStatus('Your choice was saved, but the install notification could not yet be deleted.');
    }
  };

  installButton.onclick = async () => {
    if (!deferredInstallPrompt) {
      if (!instructionsShown) {
        instructionsShown = true;
        help.textContent = /iPhone|iPad|iPod/i.test(navigator.userAgent)
          ? 'In Safari, tap Share, then choose “Add to Home Screen”.'
          : 'Open your browser menu and choose “Install Gamer Studio” or “Add to Home Screen”.';
        help.hidden = false;
        installButton.textContent = 'Done';
        return;
      }
      await finishPrompt();
      return;
    }

    installButton.disabled = true;
    try {
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      await promptEvent.prompt();
      await promptEvent.userChoice;
      await finishPrompt();
    } catch (error) {
      console.error('Unable to show the browser install prompt:', error);
      installButton.disabled = false;
      help.textContent = 'The browser could not open its install prompt. Use the browser menu to install instead.';
      help.hidden = false;
    }
  };
  laterButton.onclick = finishPrompt;
}

function formatNotificationTime(timestamp) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (elapsedSeconds < 60) return 'Just now';
  if (elapsedSeconds < 3600) return relative.format(-Math.floor(elapsedSeconds / 60), 'minute');
  if (elapsedSeconds < 86400) return relative.format(-Math.floor(elapsedSeconds / 3600), 'hour');
  if (elapsedSeconds < 604800) return relative.format(-Math.floor(elapsedSeconds / 86400), 'day');
  return new Date(timestamp).toLocaleDateString();
}

function showNotificationStatus(message) {
  notificationStatus.textContent = message;
  notificationStatus.hidden = false;
}

async function refreshNotifications() {
  if (!notificationBell || !notificationPanel || !notificationCount || !notificationList
    || !notificationStatus || !markAllNotificationsButton) return;
  try {
    try {
      await clearOldReadNotifications();
      notificationCleanupWarningShown = false;
    } catch (error) {
      if (!notificationCleanupWarningShown) {
        console.warn('Unable to clear expired notifications:', error);
        notificationCleanupWarningShown = true;
      }
    }
    const {
      notifications: allNotifications,
      unreadMessageCount,
      unreadSocialCount
    } = await getNotifications();
    const notifications = allNotifications.filter((notification) => {
      if (notification.type === 'app_install') return true;
      if (notification.type === 'direct_message') return appSettings.messageNotifications;
      return appSettings.socialNotifications;
    });
    const unreadInstallCount = allNotifications.filter(
      (notification) => notification.type === 'app_install' && !notification.read_at
    ).length;
    const unreadCount = (appSettings.messageNotifications ? unreadMessageCount : 0)
      + (appSettings.socialNotifications ? unreadSocialCount : unreadInstallCount);
    notificationCount.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    notificationCount.hidden = unreadCount === 0;
    notificationBell.setAttribute(
      'aria-label',
      unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
    );
    markAllNotificationsButton.disabled = unreadCount === 0;
    notificationList.replaceChildren();

    if (!notifications.length) {
      showNotificationStatus(allNotifications.length
        ? 'Notifications are hidden by your current settings.'
        : 'You’re all caught up. New activity will appear here.');
      return;
    }

    notificationStatus.hidden = true;
    notifications.forEach((notification) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.classList.add('notification-item');
      if (!notification.read_at) item.classList.add('unread');

      const dot = document.createElement('span');
      dot.classList.add('notification-dot');
      dot.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      copy.classList.add('notification-copy');
      const message = document.createElement('span');
      message.textContent = notification.message;
      const time = document.createElement('time');
      time.classList.add('notification-time');
      time.dateTime = notification.created_at;
      time.textContent = formatNotificationTime(notification.created_at);
      copy.append(message, time);
      item.append(dot, copy);
      item.addEventListener('click', async () => {
        if (notification.type === 'app_install') {
          notificationPanel.hidden = true;
          notificationBell.setAttribute('aria-expanded', 'false');
          showInstallPrompt(notification);
          return;
        }
        item.disabled = true;
        try {
          if (!notification.read_at) await markNotificationRead(notification.id);
          notificationPanel.hidden = true;
          notificationBell.setAttribute('aria-expanded', 'false');
          await refreshNotifications();
          if (notification.post_id) {
            await showFeeds();
            const relatedPost = document.getElementById(`post-${notification.post_id}`);
            if (relatedPost) {
              relatedPost.scrollIntoView({ behavior: 'smooth', block: 'center' });
              if (notification.type === 'comment') {
                relatedPost.querySelector('.post-comment-toggle')?.click();
              }
            }
          } else if (
            notification.type === 'friend_request'
            || notification.type === 'friend_request_accepted'
            || notification.type === 'direct_message'
          ) {
            setActiveMenuItem(MESSAGES_MENU_ITEM);
            await showMessages(
              notification.type === 'direct_message' ? notification.actor_id : null
            );
          }
        } catch (error) {
          console.error('Unable to open notification:', error);
          showNotificationStatus('This notification could not be opened. Please try again.');
          item.disabled = false;
        }
      });
      notificationList.appendChild(item);
    });
    const installNotification = allNotifications.find(
      (notification) => notification.type === 'app_install' && !notification.read_at
    );
    if (installNotification) showInstallPrompt(installNotification);
  } catch (error) {
    console.error('Unable to load notifications:', error);
    if (!notificationPanel.hidden) {
      showNotificationStatus('Notifications could not be loaded. Check your connection and try again.');
    }
  }
}

notificationBell?.addEventListener('click', async () => {
  const isOpening = notificationPanel.hidden;
  notificationPanel.hidden = !isOpening;
  notificationBell.setAttribute('aria-expanded', String(isOpening));
  if (isOpening) await refreshNotifications();
});

markAllNotificationsButton?.addEventListener('click', async () => {
  markAllNotificationsButton.disabled = true;
  try {
    await markAllNotificationsRead();
    await refreshNotifications();
  } catch (error) {
    console.error('Unable to mark notifications as read:', error);
    showNotificationStatus('Notifications could not be updated. Please try again.');
    markAllNotificationsButton.disabled = false;
  }
});

document.addEventListener('pointerdown', (event) => {
  if (notificationMenu && !notificationMenu.contains(event.target)) {
    notificationPanel.hidden = true;
    notificationBell?.setAttribute('aria-expanded', 'false');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !notificationPanel.hidden) {
    notificationPanel.hidden = true;
    notificationBell.setAttribute('aria-expanded', 'false');
    notificationBell.focus();
  }
});

refreshNotifications();
const notificationRefreshTimer = window.setInterval(() => {
  if (!document.hidden) refreshNotifications();
}, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshNotifications();
  else hideIncomingMessageBanner();
});
window.addEventListener('beforeunload', () => {
  window.clearInterval(notificationRefreshTimer);
  if (notificationChannel) supabase.removeChannel(notificationChannel);
  if (directMessageNotificationChannel) supabase.removeChannel(directMessageNotificationChannel);
});
supabase.auth.getUser().then(({ data, error }) => {
  if (error) throw error;
  if (!data.user || !notificationBell) return;
  notificationUserId = data.user.id;
  notificationChannel = supabase
    .channel(`user-notifications-${data.user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `recipient_id=eq.${data.user.id}`
    }, refreshNotifications)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Live notifications are unavailable; periodic refresh remains enabled.');
      }
    });
  directMessageNotificationChannel = supabase
    .channel(`incoming-direct-messages-${data.user.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'direct_messages',
      filter: `recipient_id=eq.${data.user.id}`
    }, handleIncomingDirectMessage)
    .subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('Live message banners are unavailable.');
      }
    });
}).catch((error) => {
  console.error('Unable to enable live notifications:', error);
});

const MENU_ITEMS = document.querySelectorAll('.lines');

MENU_ITEMS.forEach((item) => {
  item.addEventListener('click', () => {
    MENU_ITEMS.forEach((menuItem) => {
      menuItem.classList.remove('active');
      menuItem.removeAttribute('aria-current');
    });
    item.classList.add('active');
    item.setAttribute('aria-current', 'page');
  });
});

document.querySelectorAll('.toggle-form').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();

    const targetId = link.dataset.target;
    const container1 = document.getElementById('container1');
    const container2 = document.getElementById('container2');

    if (!container1 || !container2) return;

    container1.style.display = targetId === 'container1' ? 'flex' : 'none';
    container2.style.display = targetId === 'container2' ? 'flex' : 'none';
  });
});
const SLIDER_TRACK = document.getElementById('slider-track');
const SLIDES = Array.from(document.querySelectorAll('.slide'));
const SLIDER_INDICATORS = document.getElementById('slider-indicators');
const PREVIOUS_SLIDE = document.getElementById('previous-slide');
const NEXT_SLIDE = document.getElementById('next-slide');
let refreshGamingNews = null;
let gamingNewsCarouselTimer = 0;
const gamingTopicPattern = /\b(?:video[\s-]?games?|gaming|gamers?|playstation|xbox|nintendo|steam|epic games|esports?|pc gaming|game developers?|game development|game studios?|game releases?|game updates?|gaming industry|gaming console|gaming hardware|fortnite|minecraft|roblox|call of duty|grand theft auto|gta vi|elden ring|final fantasy|zelda|pokemon|league of legends|valorant|counter[\s-]?strike|overwatch|apex legends|destiny 2|helldivers|monster hunter|resident evil|assassin'?s creed|cyberpunk 2077|the sims|world of warcraft|diablo)\b/i;

if (SLIDER_TRACK && SLIDES.length && SLIDER_INDICATORS) {
  let currentSlide = 0;
  let featuredSlideCount = 0;

  function showSlide(index) {
    if (!featuredSlideCount) return;
    currentSlide = (index + featuredSlideCount) % featuredSlideCount;
    SLIDER_TRACK.style.transform = `translateX(-${currentSlide * 100}%)`;

    Array.from(SLIDER_INDICATORS.children).forEach((indicator, indicatorIndex) => {
      indicator.setAttribute('aria-current', String(indicatorIndex === currentSlide));
    });
  }

  let swipeStart = null;
  SLIDER_TRACK.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    swipeStart = { x: event.clientX, y: event.clientY };
  });
  SLIDER_TRACK.addEventListener('pointerup', (event) => {
    if (!swipeStart) return;
    const deltaX = event.clientX - swipeStart.x;
    const deltaY = event.clientY - swipeStart.y;
    swipeStart = null;

    if (Math.abs(deltaX) < 45 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    showSlide(currentSlide + (deltaX < 0 ? 1 : -1));
  });
  SLIDER_TRACK.addEventListener('pointercancel', () => {
    swipeStart = null;
  });

  PREVIOUS_SLIDE?.addEventListener('click', () => showSlide(currentSlide - 1));
  NEXT_SLIDE?.addEventListener('click', () => showSlide(currentSlide + 1));

  async function getGamingNews() {
    const response = await fetch('/.netlify/functions/gaming-news');
    let data;
    try {
      data = await response.json();
    } catch (error) {
      if (!response.ok) {
        throw new Error(`Gaming news service returned ${response.status}.`);
      }
      throw new Error('Gaming news service returned invalid JSON.', { cause: error });
    }
    if (!response.ok) {
      throw new Error(data.error || `Gaming news service returned ${response.status}.`);
    }
    if (!Array.isArray(data.articles)) {
      throw new Error('Gaming news response did not contain an articles list');
    }
    return data.articles.filter((article) => (
      article
      && typeof article.title === 'string'
      && gamingTopicPattern.test(`${article.title} ${article.description || ''}`)
    ));
  }

  const newsStatus = document.getElementById('game-news-status');
  if (newsStatus) newsStatus.textContent = 'Loading gaming news...';
  let newsRequestId = 0;

  function formatPublishedDate(publishedAt) {
    if (!publishedAt) return 'Publication date unavailable';
    const date = new Date(publishedAt);
    return Number.isNaN(date.getTime())
      ? 'Publication date unavailable'
      : `Published ${date.toLocaleDateString()}`;
  }

  async function loadGamingNews() {
    const requestId = ++newsRequestId;
    window.clearInterval(gamingNewsCarouselTimer);
    gamingNewsCarouselTimer = 0;
    if (newsStatus) newsStatus.textContent = 'Loading gaming news...';
    try {
      const articles = await getGamingNews();
      if (requestId !== newsRequestId) return;
      const featuredArticles = articles.slice(0, SLIDES.length);
      const remainingArticles = articles.slice(featuredArticles.length);
      featuredSlideCount = featuredArticles.length;

      SLIDER_INDICATORS.replaceChildren();
      SLIDES.forEach((slide, index) => {
        slide.style.display = index < featuredSlideCount ? 'flex' : 'none';
      });

      featuredArticles.forEach((article, index) => {
        const slide = SLIDES[index];
        const image = slide.querySelector('.image');
        const title = slide.querySelector('.game_content');
        const description = slide.querySelector('.game_description');

        if (image) {
          if (article.image) {
            image.src = article.image;
            image.alt = article.title || 'Gaming news';
            image.loading = 'eager';
            image.decoding = 'async';
            image.onerror = () => {
              image.hidden = true;
            };
            image.onload = () => {
              image.hidden = false;
            };
            image.hidden = false;
          } else {
            image.onerror = null;
            image.onload = null;
            image.removeAttribute('src');
            image.alt = '';
            image.hidden = true;
          }
        }
        if (title) title.textContent = article.title || 'Untitled gaming news';
        if (description) {
          description.textContent = [
            article.description,
            formatPublishedDate(article.publishedAt)
          ].filter(Boolean).join(' · ');
        }

        const indicator = document.createElement('button');
        indicator.className = 'slider-indicator';
        indicator.type = 'button';
        indicator.setAttribute('aria-label', `Show ${article.title || 'gaming news'}`);
        indicator.setAttribute('aria-current', String(index === 0));
        indicator.addEventListener('click', () => showSlide(index));
        SLIDER_INDICATORS.append(indicator);
      });

      const remainingArticlesList = document.getElementById('remaining-games');
      if (remainingArticlesList) {
        remainingArticlesList.replaceChildren();
        remainingArticles.forEach((article) => {
          const card = document.createElement('article');
          card.className = 'remaining-game';

          if (article.image) {
            const image = document.createElement('img');
            image.src = article.image;
            image.alt = article.title || 'Gaming news';
            image.loading = 'lazy';
            image.decoding = 'async';
            image.addEventListener('error', () => image.remove(), { once: true });
            card.append(image);
          }

          const title = document.createElement('h3');
          title.textContent = article.title || 'Untitled gaming news';
          card.append(title);

          const details = document.createElement('p');
          details.textContent = [
            article.description,
            formatPublishedDate(article.publishedAt)
          ].filter(Boolean).join(' · ');
          card.append(details);
          remainingArticlesList.append(card);
          if (article.url) {
            const articleURL = new URL(article.url);
            if (articleURL.protocol === 'https:' || articleURL.protocol === 'http:') {
              const readMore = document.createElement('a');
              readMore.href = articleURL.href;
              readMore.target = '_blank';
              readMore.rel = 'noopener noreferrer';
              readMore.textContent = 'Read more';
              details.append(' ', readMore);
            }
          }
        });
      }

      if (newsStatus) {
        newsStatus.textContent = articles.length ? '' : 'No gaming news is available right now.';
      }

      if (featuredArticles.length > 1) {
        gamingNewsCarouselTimer = window.setInterval(() => {
          showSlide(currentSlide + 1);
        }, 9000);
      }

    } catch (error) {
      if (requestId !== newsRequestId) return;
      console.error('Unable to load gaming news:', error);
      if (newsStatus) {
        newsStatus.textContent = `Gaming news could not be loaded. ${error.message} Pull down to refresh.`;
      }
    }
  }

  refreshGamingNews = loadGamingNews;
  loadGamingNews();
}
const GAME_NEWS_MENU_ITEM = Array.from(MENU_ITEMS).find(
  (item) => item.querySelector('.menu-label')?.textContent.trim() === 'Game News'
);
const FEED_MENU_ITEM = Array.from(MENU_ITEMS).find(
  (item) => item.querySelector('.menu-label')?.textContent.trim() === 'Feed'
);
const GAME_NEWS_TAB = document.getElementById('button');
const FEEDS_TAB = document.getElementById('button1');
const NEWS_CONTAINER = document.getElementById('news-view');
const MAIN_CONTAINER = document.getElementById('news-container');
const messagesSearchButton = document.getElementById('messages-search-button');
const messagesMoreButton = document.getElementById('messages-more-button');
const messagesDeleteButton = document.getElementById('messages-delete-button');
const messagesMoreMenu = document.getElementById('messages-more-menu');
const messagesMenuStatus = document.getElementById('messages-menu-status');
const markMessagesReadButton = document.getElementById('mark-messages-read');
const createGroupChatButton = document.getElementById('create-group-chat');
const openChatSettingsButton = document.getElementById('open-chat-settings');
const appBarTitle = document.getElementById('header1');
let sectionView = null;
let activeProfileFriendChannel = null;
let feedLoadRequestId = 0;
let isFeedView = false;
let isGameNewsView = true;
let isFeedRefreshInProgress = false;
let isGameNewsRefreshInProgress = false;
let currentMessageChannel = null;
let clearActiveVoiceNote = null;
let clearActiveMessageAttachment = null;
let messageViewId = 0;
let activeGamersPresenceChannel = null;
let activeGamersPresenceUserId = null;
let activeGamerIds = new Set();
let activeGamersPresenceStatus = 'connecting';
let refreshActiveFriendFinder = null;
let closeActiveFriendFinder = null;
let deleteSelectedConversation = null;
let clearCurrentConversationSelection = null;

function closeProfileFriendChannel() {
  if (!activeProfileFriendChannel) return;
  supabase.removeChannel(activeProfileFriendChannel);
  activeProfileFriendChannel = null;
}

function setAppBarState(view, title = 'Gamer Studio') {
  document.body.dataset.appView = view;
  document.body.dataset.chatOpen = 'false';
  const appBarTitleLabel = appBarTitle?.querySelector('span');
  if (appBarTitleLabel) appBarTitleLabel.textContent = title;
  else if (appBarTitle) appBarTitle.textContent = title;
  const isMessages = view === 'messages';
  if (messagesSearchButton) messagesSearchButton.hidden = !isMessages;
  if (messagesMoreButton) messagesMoreButton.hidden = !isMessages;
  if (messagesDeleteButton) messagesDeleteButton.hidden = true;
  if (!isMessages) {
    deleteSelectedConversation = null;
    clearCurrentConversationSelection = null;
    closeActiveFriendFinder?.();
    if (messagesMoreMenu) messagesMoreMenu.hidden = true;
    messagesMoreButton?.setAttribute('aria-expanded', 'false');
  }
}

setAppBarState('home');
document.addEventListener('pointerdown', (event) => {
  clearCurrentConversationSelection?.(event);
});

window.matchMedia('(max-width: 680px)').addEventListener('change', (event) => {
  if (!event.matches) closeActiveFriendFinder?.();
});

async function startActiveGamersPresence() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user || activeGamersPresenceChannel) return;

  const user = data.user;
  activeGamersPresenceUserId = user.id;
  activeGamersPresenceChannel = supabase
    .channel('gamer-studio-active-gamers', {
      config: { presence: { key: user.id } }
    })
    .on('presence', { event: 'sync' }, () => {
      const presenceState = activeGamersPresenceChannel?.presenceState() || {};
      activeGamersPresenceStatus = 'ready';
      activeGamerIds = new Set(
        Object.values(presenceState)
          .flat()
          .map((presence) => presence.user_id)
          .filter((id) => typeof id === 'string')
      );
      refreshActiveFriendFinder?.();
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const presenceStatus = appSettings.showOnlineStatus
          ? await activeGamersPresenceChannel.track({ user_id: user.id })
          : await activeGamersPresenceChannel.untrack();
        if (presenceStatus !== 'ok') {
          activeGamersPresenceStatus = 'error';
          console.error('Unable to publish active gamer presence:', presenceStatus);
          refreshActiveFriendFinder?.();
        }
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        activeGamersPresenceStatus = 'error';
        console.error('Unable to connect active gamer presence:', status);
        refreshActiveFriendFinder?.();
      }
    });
}

startActiveGamersPresence().catch((error) => {
  console.error('Unable to start active gamer presence:', error);
});

function closeMessageChannel() {
  const clearVoiceNote = clearActiveVoiceNote;
  clearActiveVoiceNote = null;
  clearVoiceNote?.();
  const clearMessageAttachment = clearActiveMessageAttachment;
  clearActiveMessageAttachment = null;
  clearMessageAttachment?.();
  if (currentMessageChannel) {
    supabase.removeChannel(currentMessageChannel);
    currentMessageChannel = null;
  }
}

function showSectionView(
  title,
  message,
  { headingClass = '', isProfile = false, isOwnProfile = true, profile = null } = {}
) {
  if (!NEWS_CONTAINER || !MAIN_CONTAINER) return;

  closeProfileFriendChannel();
  const view = isProfile ? 'profile' : (title === 'Messages' ? 'messages' : 'section');
  setAppBarState(view, isProfile ? 'Profile' : title);
  closeMessageChannel();
  refreshActiveFriendFinder = null;
  closeActiveFriendFinder = null;
  messageViewId += 1;
  isFeedView = false;
  isGameNewsView = false;
  feedLoadRequestId += 1;
  NEWS_CONTAINER.hidden = true;
  if (!sectionView) {
    sectionView = document.createElement('section');
    sectionView.id = 'section-view';
    sectionView.setAttribute('aria-live', 'polite');
    MAIN_CONTAINER.appendChild(sectionView);
  }

  sectionView.replaceChildren();
  sectionView.classList.remove('messages-view');
  sectionView.classList.remove('messages-conversation-open');
  sectionView.classList.remove('settings-view');
  sectionView.classList.toggle('profile-view', isProfile);
  if (isProfile) {
    let profileName = title;
    const profileCover = document.createElement('div');
    profileCover.className = 'profile-cover';
    const profileCoverImage = document.createElement('img');
    profileCoverImage.alt = '';
    profileCoverImage.src = profile?.background_image_url || '';
    profileCoverImage.hidden = !profile?.background_image_url;
    profileCover.appendChild(profileCoverImage);
    const profileHero = document.createElement('div');
    profileHero.className = 'profile-hero';
    profileHero.appendChild(profileCover);
    if (isOwnProfile) {
      const coverInput = document.createElement('input');
      coverInput.type = 'file';
      coverInput.accept = 'image/*';
      coverInput.className = 'profile-cover-input';
      coverInput.setAttribute('aria-label', 'Choose a profile background image');
      const coverButton = document.createElement('label');
      coverButton.className = 'profile-cover-button';
      const coverButtonLabel = document.createElement('span');
      coverButtonLabel.textContent = profile?.background_image_url ? 'Change background' : 'Add background';
      const coverButtonIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      coverButtonIcon.setAttribute('viewBox', '0 0 24 24');
      coverButtonIcon.setAttribute('fill', 'none');
      coverButtonIcon.setAttribute('stroke-width', '1.8');
      coverButtonIcon.setAttribute('stroke', 'currentColor');
      coverButtonIcon.setAttribute('aria-hidden', 'true');
      coverButtonIcon.innerHTML = `
  <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5" />
</svg>`;
      coverButton.setAttribute('aria-label', coverButtonLabel.textContent);
      coverButton.append(coverButtonIcon, coverButtonLabel);
      const coverStatus = document.createElement('span');
      coverStatus.className = 'profile-cover-status';
      coverStatus.setAttribute('role', 'status');
      coverStatus.setAttribute('aria-live', 'polite');
      coverStatus.hidden = true;
      coverInput.addEventListener('change', async () => {
        const file = coverInput.files?.[0];
        if (!file) return;
        coverInput.disabled = true;
        coverButton.classList.add('is-uploading');
        coverButtonLabel.textContent = 'Uploading…';
        coverButton.setAttribute('aria-label', 'Uploading profile background');
        coverStatus.hidden = true;
        try {
          const backgroundURL = await uploadProfileBackground(file, (status) => {
            coverButtonLabel.textContent = status === 'saving'
              ? 'Saving…'
              : 'Uploading…';
            coverButton.setAttribute(
              'aria-label',
              status === 'saving' ? 'Saving profile background' : 'Uploading profile background'
            );
            coverStatus.textContent = status === 'saving'
              ? 'Saving background to your profile…'
              : 'Uploading and optimizing your background…';
            coverStatus.hidden = false;
          });
          profileCoverImage.src = backgroundURL;
          profileCoverImage.hidden = false;
          coverStatus.textContent = 'Background saved.';
          window.setTimeout(() => {
            coverStatus.hidden = true;
          }, 2400);
          coverButtonLabel.textContent = 'Change background';
        } catch (error) {
          console.error('Unable to upload profile background:', error);
          coverStatus.textContent = error.message || 'Background upload failed.';
          coverStatus.hidden = false;
        } finally {
          coverInput.disabled = false;
          coverButton.classList.remove('is-uploading');
          coverButtonLabel.textContent = profileCoverImage.hidden ? 'Add background' : 'Change background';
          coverButton.setAttribute('aria-label', coverButtonLabel.textContent);
          coverInput.value = '';
        }
      });
      coverButton.append(coverInput);
      profileCover.append(coverStatus, coverButton);
    }
    sectionView.appendChild(profileHero);
    const profileIdentity = document.createElement('div');
    profileIdentity.className = 'profile-identity';
    profileHero.appendChild(profileIdentity);
    if (!isOwnProfile && profile) {
      const profileAvatar = document.createElement('div');
      profileAvatar.classList.add('profilediv2');
      const profileImage = document.createElement('img');
      profileImage.classList.add('profile-avatar-image');
      profileImage.alt = 'Profile picture';
      profileImage.src = profile.avatar_url || '';
      profileImage.hidden = !profile.avatar_url;
      const profileInitial = document.createElement('span');
      profileInitial.textContent = (profileName || 'G').trim().charAt(0).toUpperCase() || 'G';
      profileInitial.hidden = Boolean(profile.avatar_url);
      profileAvatar.append(profileImage, profileInitial);

      const profileWrap = document.createElement('div');
      profileWrap.classList.add('profile-avatar-wrap');
      profileWrap.appendChild(profileAvatar);
      profileIdentity.append(profileWrap);

      const profileHeading = document.createElement('h2');
      profileHeading.classList.add('profile-name');
      profileHeading.textContent = profileName;
      sectionView.append(profileHeading);
    }
    if (isOwnProfile || !profile) {
      const profilePictureInput = document.createElement('input');
      profilePictureInput.type = 'file';
      profilePictureInput.accept = 'image/*';
      profilePictureInput.hidden = true;

      const profileAvatar = document.createElement('div');
      profileAvatar.classList.add('profilediv2');
      const profileAvatarImage = document.createElement('img');
      profileAvatarImage.classList.add('profile-avatar-image');
      profileAvatarImage.alt = 'Profile picture';
      profileAvatar.appendChild(profileAvatarImage);

      const profileWrap = document.createElement('div');
      profileWrap.classList.add('profile-avatar-wrap');
      profileWrap.append(profileAvatar, profilePictureInput);

      const uploadStatus = document.createElement('div');
      uploadStatus.classList.add('profile-upload-status');
      uploadStatus.setAttribute('role', 'status');
      uploadStatus.setAttribute('aria-live', 'polite');
      uploadStatus.hidden = true;
      const uploadProgress = document.createElement('progress');
      uploadProgress.max = 100;
      uploadProgress.value = 0;
      uploadProgress.setAttribute('aria-label', 'Profile picture upload progress');
      const uploadMessage = document.createElement('span');
      uploadStatus.append(uploadProgress, uploadMessage);

      const profileIcon = document.createElement('button');
      profileIcon.type = 'button';
      profileIcon.classList.add('profilediv');
      profileIcon.setAttribute('aria-label', 'Change profile picture');
      profileIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
    <path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
    <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
  </svg>
  `
      profileWrap.appendChild(profileIcon);
      profileIcon.addEventListener('click', () => profilePictureInput.click());
      profilePictureInput.addEventListener('change', async () => {
        const file = profilePictureInput.files?.[0];
        if (!file) return;

        profileIcon.disabled = true;
        profileIcon.setAttribute('aria-busy', 'true');
        uploadProgress.removeAttribute('value');
        uploadStatus.hidden = false;
        uploadStatus.classList.remove('upload-error', 'upload-success');
        uploadMessage.textContent = 'Uploading profile picture…';
        try {
          const photoURL = await uploadProfilePicture(file, (status) => {
            uploadMessage.textContent = status === 'saving'
              ? 'Saving profile picture…'
              : 'Uploading profile picture…';
          });
          uploadProgress.value = 100;
          applyProfilePicture(photoURL);
          window.dispatchEvent(new CustomEvent('gamer-profile-updated', {
            detail: { name: profileName, photoURL }
          }));
          uploadStatus.classList.add('upload-success');
          uploadMessage.textContent = 'Profile picture saved.';
        } catch (error) {
          console.error('Unable to upload profile picture:', error);
          uploadStatus.classList.add('upload-error');
          uploadMessage.textContent =
            error.message || 'Your profile picture could not be uploaded. Please try again.';
        } finally {
          profileIcon.disabled = false;
          profileIcon.removeAttribute('aria-busy');
          profilePictureInput.value = '';
        }
      });
      profileIdentity.appendChild(profileWrap);
      sectionView.appendChild(uploadStatus);
      applyProfilePicture(profilePhotoURL);

      const profileNameRow = document.createElement('div');
      profileNameRow.classList.add('profile-name-row');
      const profileHeading = document.createElement('h2');
      profileHeading.classList.add('profile-name');
      profileHeading.textContent = profileName;

      const editNameButton = document.createElement('button');
      editNameButton.type = 'button';
      editNameButton.classList.add('profile-name-edit');
      editNameButton.setAttribute('aria-label', 'Edit name');
      editNameButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
  </svg>`;

      editNameButton.addEventListener('click', () => {
        const editor = document.createElement('form');
        editor.classList.add('profile-name-editor');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = profileName;
        nameInput.maxLength = 40;
        nameInput.setAttribute('aria-label', 'Profile name');

        const saveButton = document.createElement('button');
        saveButton.type = 'submit';
        saveButton.textContent = 'Save';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => profileNameRow.replaceChildren(profileHeading, editNameButton));
        editor.append(nameInput, saveButton, cancelButton);
        profileNameRow.replaceChildren(editor);
        nameInput.focus();
        nameInput.select();

        editor.addEventListener('submit', async (event) => {
          event.preventDefault();
          saveButton.disabled = true;
          cancelButton.disabled = true;
          saveButton.textContent = 'Saving…';
          try {
            profileName = await updateDisplayName(nameInput.value);
            profileHeading.textContent = profileName;
            profileNameRow.replaceChildren(profileHeading, editNameButton);
          } catch (error) {
            console.error('Unable to update profile name:', error);
            alert(error.message || 'Your name could not be updated. Please try again.');
            saveButton.disabled = false;
            cancelButton.disabled = false;
            saveButton.textContent = 'Save';
          }
        });
      });

      profileNameRow.append(profileHeading, editNameButton);
      sectionView.appendChild(profileNameRow);
    }
    let profileStatus = profile?.profile_status?.trim() || '';
    const statusWrap = document.createElement('div');
    statusWrap.className = 'profile-status-wrap';
    const statusBubble = document.createElement('p');
    statusBubble.className = 'profile-status-bubble';
    statusBubble.textContent = profileStatus || (isOwnProfile ? 'Add a status to let gamers know what you are thinking.' : 'No status yet.');
    statusBubble.classList.toggle('is-empty', !profileStatus);
    statusWrap.appendChild(statusBubble);

    if (isOwnProfile) {
      const editStatusButton = document.createElement('button');
      editStatusButton.type = 'button';
      editStatusButton.className = 'profile-status-edit';
      editStatusButton.textContent = profileStatus ? 'Edit status' : 'Add status';
      editStatusButton.addEventListener('click', () => {
        const editor = document.createElement('form');
        editor.className = 'profile-status-editor';
        const statusInput = document.createElement('textarea');
        statusInput.maxLength = 120;
        statusInput.value = profileStatus;
        statusInput.placeholder = 'What are you thinking about?';
        statusInput.setAttribute('aria-label', 'Profile status');
        const actions = document.createElement('div');
        actions.className = 'profile-status-editor-actions';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        const saveButton = document.createElement('button');
        saveButton.type = 'submit';
        saveButton.textContent = 'Save';
        cancelButton.addEventListener('click', () => {
          statusBubble.textContent = profileStatus || 'Add a status to let gamers know what you are thinking.';
          statusBubble.classList.toggle('is-empty', !profileStatus);
          statusWrap.replaceChildren(statusBubble, editStatusButton);
        });
        actions.append(cancelButton, saveButton);
        editor.append(statusInput, actions);
        statusWrap.replaceChildren(editor);
        statusInput.focus();
        editor.addEventListener('submit', async (event) => {
          event.preventDefault();
          saveButton.disabled = true;
          cancelButton.disabled = true;
          try {
            const savedStatus = await updateProfileStatus(statusInput.value);
            profileStatus = savedStatus;
            statusBubble.textContent = savedStatus || 'Add a status to let gamers know what you are thinking.';
            statusBubble.classList.toggle('is-empty', !savedStatus);
            editStatusButton.textContent = savedStatus ? 'Edit status' : 'Add status';
            statusWrap.replaceChildren(statusBubble, editStatusButton);
          } catch (error) {
            console.error('Unable to update profile status:', error);
            const errorMessage = document.createElement('span');
            errorMessage.className = 'profile-status-error';
            errorMessage.setAttribute('role', 'alert');
            errorMessage.textContent = error.message || 'Your status could not be saved. Please try again.';
            editor.appendChild(errorMessage);
            saveButton.disabled = false;
            cancelButton.disabled = false;
          }
        });
      });
      statusWrap.appendChild(editStatusButton);
    }
    profileIdentity.appendChild(statusWrap);
  }

  const heading = document.createElement('h2');
  if (!isProfile) {
    if (headingClass) heading.classList.add(headingClass);
    heading.textContent = title;
    sectionView.appendChild(heading);
  }
  if (message) {
    const description = document.createElement('p');
    description.textContent = message;
    sectionView.appendChild(description);
  }
  sectionView.hidden = false;
}

function showNewsView() {
  if (!NEWS_CONTAINER) return;

  closeProfileFriendChannel();
  closeMessageChannel();
  refreshActiveFriendFinder = null;
  messageViewId += 1;
  NEWS_CONTAINER.hidden = false;
  if (sectionView) sectionView.hidden = true;
}

function createMessageAvatar(profile, className = 'message-avatar') {
  const avatar = document.createElement('span');
  avatar.className = className;
  const image = document.createElement('img');
  image.alt = '';
  image.hidden = !profile.avatar_url;
  if (profile.avatar_url) image.src = profile.avatar_url;
  const initials = document.createElement('span');
  initials.textContent = (profile.username || 'G').charAt(0).toUpperCase();
  initials.hidden = Boolean(profile.avatar_url);
  avatar.append(image, initials);
  return avatar;
}

function createGamerOption(profile, onSelect, subtitle = '') {
  const option = document.createElement('button');
  option.type = 'button';
  option.className = 'message-gamer-option';
  option.dataset.gamerId = profile.id;
  option.appendChild(createMessageAvatar(profile));
  const details = document.createElement('span');
  details.className = 'message-gamer-details';
  const name = document.createElement('span');
  name.className = 'message-gamer-name';
  name.textContent = profile.username || 'Gamer';
  details.appendChild(name);
  if (subtitle) {
    const preview = document.createElement('span');
    preview.className = 'message-gamer-preview';
    preview.textContent = subtitle;
    details.appendChild(preview);
  }
  option.appendChild(details);
  option.addEventListener('click', () => onSelect(profile));
  return option;
}

function showMessageStatus(element, message, isError = false) {
  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle('message-status-error', isError);
}

function createVoiceWaveform(seed = '') {
  const waveform = document.createElement('div');
  waveform.className = 'voice-note-waveform';
  waveform.setAttribute('role', 'img');
  waveform.setAttribute('aria-label', 'Voice note waveform');
  let noise = 2166136261;
  for (const character of seed) {
    noise = Math.imul(noise ^ character.charCodeAt(0), 16777619);
  }
  for (let index = 0; index < 42; index += 1) {
    noise ^= noise << 13;
    noise ^= noise >>> 17;
    noise ^= noise << 5;
    const bar = document.createElement('span');
    bar.className = 'voice-note-waveform-bar';
    bar.style.setProperty('--bar-height', `${22 + ((noise >>> 0) % 79)}%`);
    bar.style.setProperty('--bar-delay', `${index % 9 * -65}ms`);
    waveform.appendChild(bar);
  }
  return waveform;
}

async function compressMessageImage(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error('This image could not be opened for compression.', { cause: error });
  }
  const scale = Math.min(1, 1440 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Image compression is unavailable in this browser.');
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const compressed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.76));
  if (!compressed) throw new Error('This image could not be compressed.');
  const originalTypeIsAllowed = ['image/webp', 'image/jpeg', 'image/png', 'image/gif'].includes(file.type);
  const blob = file.type === 'image/gif'
    ? file
    : compressed.size < file.size || !originalTypeIsAllowed ? compressed : file;
  const contentType = blob.type || file.type;
  return {
    blob,
    contentType,
    extension: contentType === 'image/webp'
      ? 'webp'
      : file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img'
  };
}

async function compressMessageVideo(file) {
  if (file.size > 100 * 1024 * 1024) {
    throw new Error('Choose a video smaller than 100 MB before compression.');
  }
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('This browser cannot compress video attachments. Try the latest Chrome, Firefox, or Safari.');
  }

  const sourceURL = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  let sourceStream = null;
  let canvasStream = null;
  let outputStream = null;
  let recorder = null;
  let frameRequest = 0;
  let timeout = 0;
  try {
    const metadataReady = new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('This video could not be decoded for compression.')), { once: true });
    });
    video.src = sourceURL;
    await metadataReady;
    if (!Number.isFinite(video.duration) || video.duration > 120) {
      throw new Error('Choose a video that is two minutes or shorter.');
    }
    const scale = Math.min(1, 960 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Video compression is unavailable in this browser.');

    const capture = video.captureStream || video.webkitCaptureStream;
    if (typeof capture !== 'function') {
      throw new Error('This browser cannot compress video attachments. Try the latest Chrome or Firefox.');
    }
    sourceStream = capture.call(video);
    canvasStream = canvas.captureStream(20);
    outputStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...sourceStream.getAudioTracks()
    ]);
    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error('This browser does not support a compressed video format.');

    recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond: 800000,
      audioBitsPerSecond: 64000
    });
    const chunks = [];
    const recording = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener('error', () => reject(new Error('Video compression failed. Try a shorter video.')), { once: true });
      recorder.addEventListener('stop', () => resolve(new Blob(chunks, { type: recorder.mimeType })), { once: true });
      video.addEventListener('ended', () => {
        if (recorder.state === 'recording') recorder.stop();
      }, { once: true });
      timeout = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, Math.ceil(video.duration * 1000) + 5000);
    });
    const drawFrame = () => {
      if (recorder.state !== 'recording') return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      frameRequest = requestAnimationFrame(drawFrame);
    };
    recorder.start(1000);
    await video.play();
    drawFrame();
    const compressed = await recording;
    const blob = compressed.size < file.size ? compressed : file;
    if (blob.size > 20 * 1024 * 1024) {
      throw new Error('The video is still larger than 20 MB after compression. Choose a shorter video.');
    }
    const contentType = blob.type || file.type;
    return {
      blob,
      contentType,
      extension: blob === file
        ? file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'video'
        : contentType.includes('mp4') ? 'mp4' : 'webm'
    };
  } finally {
    window.clearTimeout(timeout);
    cancelAnimationFrame(frameRequest);
    if (recorder?.state === 'recording') recorder.stop();
    sourceStream?.getTracks().forEach((track) => track.stop());
    canvasStream?.getTracks().forEach((track) => track.stop());
    outputStream?.getTracks().forEach((track) => track.stop());
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(sourceURL);
  }
}

async function compressMessageMedia(file) {
  if (file.type.startsWith('image/')) return compressMessageImage(file);
  if (file.type.startsWith('video/')) return compressMessageVideo(file);
  throw new Error('Choose an image or video attachment.');
}

function createVoiceNotePlayer(source, onError, waveformSeed = '', refreshSource = null) {
  const audio = document.createElement('audio');
  audio.className = 'voice-note-audio';
  audio.preload = 'metadata';

  const player = document.createElement('div');
  player.className = 'voice-note-player';
  player.setAttribute('role', 'group');
  player.setAttribute('aria-label', 'Voice note');

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'voice-note-play';
  playButton.setAttribute('aria-label', 'Play voice note');

  const waveform = createVoiceWaveform(waveformSeed);
  const seek = document.createElement('input');
  seek.type = 'range';
  seek.className = 'voice-note-seek';
  seek.min = '0';
  seek.max = '100';
  seek.step = '0.1';
  seek.value = '0';
  seek.setAttribute('aria-label', 'Seek voice note');
  waveform.appendChild(seek);

  const time = document.createElement('span');
  time.className = 'voice-note-time';
  time.textContent = '0:00';
  let sourceRefreshAttempted = false;
  let recoveryInProgress = false;
  let playbackErrorReported = false;
  const formatTime = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const wholeSeconds = Math.floor(seconds);
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
  };
  const setPlayIcon = (isPlaying) => {
    playButton.setAttribute('aria-label', isPlaying ? 'Pause voice note' : 'Play voice note');
    playButton.innerHTML = isPlaying
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zm5 0h3v14h-3z"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  };
  const updateProgress = () => {
    const duration = audio.duration;
    const progress = Number.isFinite(duration) && duration > 0 ? audio.currentTime / duration * 100 : 0;
    seek.value = String(progress);
    waveform.style.setProperty('--voice-progress', `${progress}%`);
    waveform.querySelectorAll('.voice-note-waveform-bar').forEach((bar, index) => {
      bar.classList.toggle('is-played', index / 42 * 100 <= progress);
    });
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  };
  const handlePlaybackFailure = async () => {
    if (recoveryInProgress) return;
    if (refreshSource && !sourceRefreshAttempted) {
      sourceRefreshAttempted = true;
      recoveryInProgress = true;
      try {
        const refreshedSource = await refreshSource();
        audio.src = refreshedSource;
        audio.load();
        window.setTimeout(() => {
          recoveryInProgress = false;
        }, 0);
        return;
      } catch (error) {
        console.error('Unable to refresh the voice-note link:', error);
      } finally {
        recoveryInProgress = false;
      }
    }
    if (playbackErrorReported) return;
    playbackErrorReported = true;
    const errorCode = audio.error?.code;
    if (errorCode === 2) {
      onError('Voice-note playback was interrupted by a connection problem. Check your connection and tap play to retry.');
    } else if (errorCode === 3) {
      onError('The voice-note file could not be decoded. The recording may be damaged; ask the sender to resend it.');
    } else if (errorCode === 4) {
      onError('This recording format is not supported by the current browser, or the stored file is damaged. Try another supported browser; if it still fails, ask the sender to resend it.');
    } else {
      onError('This voice note could not be opened. Check your connection and ask the sender to resend it if the problem continues.');
    }
  };
  setPlayIcon(false);
  player.append(playButton, waveform, time, audio);

  playButton.addEventListener('click', async () => {
    try {
      if (audio.paused) await audio.play();
      else audio.pause();
    } catch (error) {
      console.error('Unable to play voice note:', error);
      await handlePlaybackFailure();
    }
  });
  seek.addEventListener('input', () => {
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    audio.currentTime = audio.duration * Number(seek.value) / 100;
  });
  audio.addEventListener('loadedmetadata', updateProgress);
  audio.addEventListener('timeupdate', updateProgress);
  audio.addEventListener('playing', () => {
    playbackErrorReported = false;
    sourceRefreshAttempted = false;
    playButton.setAttribute('aria-label', 'Pause voice note');
  });
  audio.addEventListener('play', () => setPlayIcon(true));
  audio.addEventListener('pause', () => setPlayIcon(false));
  audio.addEventListener('ended', () => {
    setPlayIcon(false);
    audio.currentTime = 0;
    updateProgress();
  });
  audio.addEventListener('error', handlePlaybackFailure);
  if (source) {
    audio.src = source;
    audio.load();
  }

  return {
    element: player,
    setSource(value) {
      audio.src = value;
      audio.load();
      updateProgress();
    },
    setRecording(isRecording) {
      waveform.classList.toggle('is-recording', isRecording);
    },
    reset() {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      seek.value = '0';
      updateProgress();
    }
  };
}

let messageAudioContext = null;

async function prepareMessageSendSound() {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    messageAudioContext ||= new AudioContextConstructor();
    await messageAudioContext.resume();
    return messageAudioContext;
  } catch (error) {
    console.warn('Message send sound is unavailable:', error);
    return null;
  }
}

function playMessageSendSound(audioContext) {
  if (!audioContext || audioContext.state !== 'running') return;
  try {
    const startTime = audioContext.currentTime;
    const masterGain = audioContext.createGain();
    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.16, startTime + 0.012);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.24);
    masterGain.connect(audioContext.destination);

    for (const [frequency, offset] of [[740, 0], [988, 0.075]]) {
      const oscillator = audioContext.createOscillator();
      const noteGain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, startTime + offset);
      noteGain.gain.setValueAtTime(0.0001, startTime + offset);
      noteGain.gain.exponentialRampToValueAtTime(0.75, startTime + offset + 0.01);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, startTime + offset + 0.15);
      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(startTime + offset);
      oscillator.stop(startTime + offset + 0.16);
    }
  } catch (error) {
    console.warn('Message send sound could not be played:', error);
  }
}

function showSettingsView() {
  setAppBarState('settings', 'Settings');
  showSectionView('Settings', '', { headingClass: 'settings-page-title' });
  if (!sectionView) return;
  sectionView.classList.add('settings-view');

  const intro = document.createElement('p');
  intro.className = 'settings-intro';
  intro.textContent = 'Make Gamer Studio feel right for you.';
  const status = document.createElement('p');
  status.className = 'settings-status';
  status.setAttribute('role', 'status');
  status.hidden = true;
  const settingsList = document.createElement('div');
  settingsList.className = 'settings-list';

  const settingItems = [
    {
      id: 'social-notifications',
      title: 'Social notifications',
      description: 'Likes, comments, follows, and friend activity.',
      setting: 'socialNotifications',
      type: 'toggle',
      icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
    },
    {
      id: 'message-notifications',
      title: 'Message notifications',
      description: 'Show unread message alerts and banners while using this device.',
      setting: 'messageNotifications',
      type: 'toggle',
      icon: '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z"/>'
    },
    {
      id: 'phone-notifications',
      title: 'Phone notifications',
      description: 'Get message alerts when Gamer Studio is in the background or closed.',
      type: 'push',
      icon: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
    },
    {
      id: 'online-status',
      title: 'Show when I’m online',
      description: 'Let other gamers see you in the active-gamers list.',
      setting: 'showOnlineStatus',
      type: 'toggle',
      icon: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>'
    },
    {
      id: 'appearance',
      title: 'Appearance',
      description: 'Choose how Gamer Studio looks on this device.',
      type: 'appearance',
      icon: '<path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.7-3.1 2 2 0 0 1 1.7-3.1H18a3 3 0 0 0 3-3c0-4.9-4-8.8-9-8.8z"/><circle cx="7.5" cy="10" r=".8"/><circle cx="11" cy="7" r=".8"/><circle cx="16" cy="8" r=".8"/>'
    },
    {
      id: 'help',
      title: 'Help and support',
      description: 'Get help with your account or using Gamer Studio.',
      type: 'help',
      icon: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01"/>'
    },
    {
      id: 'invite',
      title: 'Invite friends',
      description: 'Share Gamer Studio with your gaming friends.',
      type: 'invite',
      icon: '<circle cx="9" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m4-13v6m3-3h-6"/>'
    },
    {
      id: 'logout',
      title: 'Log out',
      description: 'Sign out of your Gamer Studio account on this device.',
      type: 'logout',
      icon: '<path d="M10 17l5-5-5-5m5 5H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>'
    }
  ];

  function persistSetting() {
    try {
      saveAppSettings();
      applyAppearance();
      status.textContent = 'Your settings have been saved on this device.';
      status.hidden = false;
      if (!notificationPanel.hidden) refreshNotifications();
      if (activeGamersPresenceChannel) {
        const presenceUpdate = appSettings.showOnlineStatus && activeGamersPresenceUserId
          ? activeGamersPresenceChannel.track({ user_id: activeGamersPresenceUserId })
          : activeGamersPresenceChannel.untrack();
        presenceUpdate.then((presenceStatus) => {
          if (presenceStatus !== 'ok') throw new Error(`Presence update returned ${presenceStatus}`);
        }).catch((error) => {
          console.error('Unable to update online status:', error);
          status.textContent = 'Setting saved, but online status could not be updated.';
        });
      }
      return true;
    } catch (error) {
      console.error('Unable to save setting:', error);
      status.textContent = error.message || 'Your setting could not be saved.';
      status.hidden = false;
      return false;
    }
  }

  for (const item of settingItems) {
    const row = document.createElement('article');
    row.className = 'settings-item';
    const icon = document.createElement('span');
    icon.className = 'settings-item-icon';
    icon.setAttribute('aria-hidden', 'true');
    const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    iconSvg.setAttribute('viewBox', '0 0 24 24');
    iconSvg.setAttribute('fill', 'none');
    iconSvg.setAttribute('stroke', 'currentColor');
    iconSvg.setAttribute('stroke-width', '1.7');
    iconSvg.setAttribute('stroke-linecap', 'round');
    iconSvg.setAttribute('stroke-linejoin', 'round');
    iconSvg.innerHTML = item.icon;
    icon.appendChild(iconSvg);
    const copy = document.createElement('div');
    copy.className = 'settings-item-copy';
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    copy.append(title, description);
    row.append(icon, copy);

    if (item.type === 'toggle' && item.setting) {
      const label = document.createElement('label');
      label.className = 'settings-switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(appSettings[item.setting]);
      input.setAttribute('aria-label', item.title);
      const track = document.createElement('span');
      track.className = 'settings-switch-track';
      label.append(input, track);
      input.addEventListener('change', () => {
        const previousValue = appSettings[item.setting];
        appSettings[item.setting] = input.checked;
        if (!persistSetting()) {
          appSettings[item.setting] = previousValue;
          input.checked = previousValue;
        }
      });
      row.appendChild(label);
    } else if (item.type === 'appearance') {
      const select = document.createElement('select');
      select.className = 'settings-select';
      select.setAttribute('aria-label', 'Appearance');
      for (const [value, label] of [['dark', 'Dark'], ['light', 'Light']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        select.appendChild(option);
      }
      select.value = appSettings.appearance;
      select.addEventListener('change', () => {
        const previousValue = appSettings.appearance;
        appSettings.appearance = select.value;
        if (!persistSetting()) {
          appSettings.appearance = previousValue;
          select.value = previousValue;
        }
      });
      row.appendChild(select);
    } else if (item.type === 'push') {
      const pushButton = document.createElement('button');
      pushButton.type = 'button';
      pushButton.className = 'settings-action';
      pushButton.textContent = 'Checking...';
      pushButton.disabled = true;
      pushButton.addEventListener('click', async () => {
        pushButton.disabled = true;
        try {
          const isEnabled = await hasPhoneNotificationSubscription();
          if (isEnabled) {
            await disablePhoneNotifications();
            pushButton.textContent = 'Enable';
            status.textContent = 'Phone notifications are off on this device.';
          } else {
            await enablePhoneNotifications();
            pushButton.textContent = 'Turn off';
            status.textContent = 'Phone notifications are on for this device.';
          }
          status.hidden = false;
        } catch (error) {
          console.error('Unable to update phone notifications:', error);
          status.textContent = error.message || 'Phone notifications could not be updated.';
          status.hidden = false;
        } finally {
          pushButton.disabled = false;
        }
      });
      row.appendChild(pushButton);
      hasPhoneNotificationSubscription().then((isEnabled) => {
        pushButton.textContent = isEnabled ? 'Turn off' : 'Enable';
        pushButton.disabled = false;
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
          description.textContent = 'Notifications are blocked by this browser. Allow them in device settings to enable alerts.';
        }
      }).catch((error) => {
        console.error('Unable to check phone notification support:', error);
        pushButton.textContent = 'Unavailable';
        status.textContent = error.message || 'Phone notifications could not be checked.';
        status.hidden = false;
      });
    } else if (item.type === 'help') {
      const helpButton = document.createElement('button');
      helpButton.type = 'button';
      helpButton.className = 'settings-action';
      helpButton.textContent = 'View help';
      const helpDetails = document.createElement('p');
      helpDetails.className = 'settings-help-details';
      helpDetails.hidden = true;
      helpDetails.textContent = 'Use Feed to share posts, Messages to chat and manage friend requests, and your profile icon to update your name or photo. If something is not working, check your connection and make sure the latest Supabase schema has been applied.';
      helpButton.setAttribute('aria-expanded', 'false');
      helpButton.addEventListener('click', () => {
        helpDetails.hidden = !helpDetails.hidden;
        helpButton.setAttribute('aria-expanded', String(!helpDetails.hidden));
        helpButton.textContent = helpDetails.hidden ? 'View help' : 'Hide help';
      });
      row.classList.add('settings-help-item');
      row.append(helpButton, helpDetails);
    } else if (item.type === 'invite') {
      const inviteButton = document.createElement('button');
      inviteButton.type = 'button';
      inviteButton.className = 'settings-action';
      inviteButton.textContent = 'Invite';
      inviteButton.addEventListener('click', async () => {
        const inviteData = {
          title: 'Join me on Gamer Studio',
          text: 'Connect with me, chat about games, and share your gaming posts on Gamer Studio.',
          url: window.location.href
        };
        try {
          if (navigator.share) {
            await navigator.share(inviteData);
          } else if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(inviteData.url);
            status.textContent = 'Invite link copied. Share it with your friends!';
            status.hidden = false;
          } else {
            throw new Error('Sharing is not supported by this browser.');
          }
        } catch (error) {
          if (error.name === 'AbortError') return;
          console.error('Unable to share invite:', error);
          status.textContent = error.message || 'The invite could not be shared.';
          status.hidden = false;
        }
      });
      row.appendChild(inviteButton);
    } else if (item.type === 'logout') {
      const logoutButton = document.createElement('button');
      logoutButton.type = 'button';
      logoutButton.className = 'settings-action';
      logoutButton.textContent = 'Log out';
      logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        logoutButton.textContent = 'Logging out...';
        try {
          await signOutUser();
        } catch (error) {
          console.error('Unable to log out:', error);
          status.textContent = error.message || 'Unable to log out. Please try again.';
          status.hidden = false;
          logoutButton.disabled = false;
          logoutButton.textContent = 'Log out';
        }
      });
      row.appendChild(logoutButton);
    }

    settingsList.appendChild(row);
  }

  sectionView.append(intro, status, settingsList);
}

async function showMessages(initialGamerId = null) {
  showSectionView('Messages', '', { headingClass: 'messages-page-title' });
  if (!sectionView) return;
  clearCurrentConversationSelection = null;
  const thisViewId = messageViewId;
  sectionView.classList.add('messages-view');

  const { data, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (thisViewId !== messageViewId) return;
  if (!data.user) throw new Error('Sign in to use messages');
  const currentUserId = data.user.id;
  deleteSelectedConversation = null;
  if (messagesDeleteButton) messagesDeleteButton.hidden = true;

  const intro = document.createElement('p');
  intro.className = 'messages-intro';
  intro.textContent = 'Your conversations, all in one place.';

  const layout = document.createElement('div');
  layout.className = 'messages-layout';
  layout.dataset.chatOpen = 'false';
  const sidebar = document.createElement('aside');
  sidebar.className = 'messages-sidebar';
  const conversationsHeading = document.createElement('h3');
  conversationsHeading.className = 'messages-list-heading';
  conversationsHeading.textContent = 'Friends';
  const conversationsStatus = document.createElement('p');
  conversationsStatus.className = 'messages-list-status';
  conversationsStatus.setAttribute('role', 'status');
  conversationsStatus.textContent = 'Loading friends and chats...';
  const friendsList = document.createElement('div');
  friendsList.className = 'messages-gamer-list';
  const recentChatsHeading = document.createElement('h3');
  recentChatsHeading.className = 'messages-list-heading';
  recentChatsHeading.textContent = 'Recent chats';
  const conversationsList = document.createElement('div');
  conversationsList.className = 'messages-gamer-list';
  sidebar.append(
    conversationsHeading,
    conversationsStatus,
    friendsList,
    recentChatsHeading,
    conversationsList
  );

  const chat = document.createElement('section');
  chat.className = 'messages-chat';
  chat.setAttribute('aria-label', 'Private conversation');
  const chatEmpty = document.createElement('div');
  chatEmpty.className = 'messages-chat-empty';
  const emptyTitle = document.createElement('h3');
  emptyTitle.textContent = 'Your next match starts here';
  const emptyCopy = document.createElement('p');
  emptyCopy.textContent = 'Choose a recent chat or search for a gamer to talk strategy, share tips, and team up.';
  chatEmpty.append(emptyTitle, emptyCopy);
  chat.appendChild(chatEmpty);
  layout.append(sidebar, chat);
  const friendFinder = document.createElement('section');
  friendFinder.id = 'messages-friend-finder';
  friendFinder.className = 'friend-finder';
  friendFinder.hidden = true;
  friendFinder.setAttribute('aria-label', 'Find gamers to add');
  const friendFinderPanel = document.createElement('div');
  friendFinderPanel.className = 'friend-finder-panel';
  friendFinderPanel.setAttribute('role', 'dialog');
  friendFinderPanel.setAttribute('aria-modal', 'true');
  friendFinderPanel.setAttribute('aria-labelledby', 'friend-finder-title');
  const friendFinderHeader = document.createElement('header');
  friendFinderHeader.className = 'friend-finder-header';
  const friendFinderTitle = document.createElement('h3');
  friendFinderTitle.id = 'friend-finder-title';
  friendFinderTitle.textContent = 'Find gamers to add';
  const closeFriendFinder = document.createElement('button');
  closeFriendFinder.type = 'button';
  closeFriendFinder.className = 'friend-finder-close';
  closeFriendFinder.setAttribute('aria-label', 'Close find gamers');
  closeFriendFinder.textContent = '×';
  friendFinderHeader.append(friendFinderTitle, closeFriendFinder);
  const searchForm = document.createElement('form');
  searchForm.className = 'messages-search';
  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.placeholder = 'Search gamers by name';
  searchInput.setAttribute('aria-label', 'Search gamers by name');
  searchInput.autocomplete = 'off';
  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.textContent = 'Search';
  searchForm.append(searchInput, searchButton);
  const searchStatus = document.createElement('p');
  searchStatus.className = 'messages-list-status';
  searchStatus.setAttribute('role', 'status');
  const searchResults = document.createElement('div');
  searchResults.className = 'messages-gamer-list friend-finder-list';
  friendFinderPanel.append(
    friendFinderHeader,
    searchForm,
    searchStatus,
    searchResults
  );
  friendFinder.appendChild(friendFinderPanel);
  sectionView.append(intro, layout, friendFinder);

  let activePeerId = null;
  let activePeer = null;
  let activeGroup = null;
  let activeThread = 0;
  let friendSearchRequestId = 0;
  let messagePressOrigin = null;
  let selectedConversation = null;
  let selectedConversationOption = null;
  let conversationHoldTimer = null;
  let heldConversationOption = null;
  let conversationHoldOrigin = null;
  let suppressConversationClick = false;
  let suppressClickTimer = null;
  let isRemovingConversation = false;

  function clearConversationSelection() {
    selectedConversation = null;
    selectedConversationOption = null;
    deleteSelectedConversation = null;
    messagesDeleteButton.hidden = true;
    messagesDeleteButton.disabled = false;
    messagesMoreButton.hidden = false;
    friendsList.querySelectorAll('.is-selected-for-delete').forEach((option) => {
      option.classList.remove('is-selected-for-delete');
      option.setAttribute('aria-pressed', 'false');
    });
    conversationsList.querySelectorAll('.is-selected-for-delete').forEach((option) => {
      option.classList.remove('is-selected-for-delete');
      option.setAttribute('aria-pressed', 'false');
    });
  }

  function selectConversationForDeletion(option) {
    if (isRemovingConversation) return;
    const isGroup = Boolean(option.dataset.groupId);
    const conversationId = isGroup ? option.dataset.groupId : option.dataset.gamerId;
    if (!conversationId) return;
    clearConversationSelection();
    selectedConversation = {
      id: conversationId,
      type: isGroup ? 'group' : 'direct'
    };
    selectedConversationOption = option;
    option.classList.add('is-selected-for-delete');
    option.setAttribute('aria-pressed', 'true');
    messagesMoreMenu.hidden = true;
    messagesMoreButton.setAttribute('aria-expanded', 'false');
    messagesMoreButton.hidden = true;
    messagesDeleteButton.hidden = false;
    showMessageStatus(conversationsStatus, 'Tap the trash icon to remove this conversation from your list.');
    deleteSelectedConversation = async () => {
      const conversation = selectedConversation;
      if (!conversation || isRemovingConversation) return;
      isRemovingConversation = true;
      messagesDeleteButton.disabled = true;
      try {
        await hideMessageConversation(conversation.type, conversation.id);
        if (
          (conversation.type === 'group' && activeGroup?.id === conversation.id)
          || (conversation.type === 'direct' && activePeerId === conversation.id)
        ) {
          activeThread += 1;
          closeMessageChannel();
          document.body.dataset.chatOpen = 'false';
          layout.dataset.chatOpen = 'false';
          sectionView.classList.remove('messages-conversation-open');
          chat.replaceChildren(chatEmpty);
          activePeerId = null;
          activePeer = null;
          activeGroup = null;
        }
        clearConversationSelection();
        await refreshConversations();
        showMessageStatus(conversationsStatus, 'Conversation removed from your Messages list.');
      } catch (error) {
        console.error('Unable to remove conversation from Messages:', error);
        showMessageStatus(
          conversationsStatus,
          error.message || 'The conversation could not be removed. Please try again.',
          true
        );
      } finally {
        isRemovingConversation = false;
        messagesDeleteButton.disabled = false;
      }
    };
  }

  function cancelConversationHold() {
    window.clearTimeout(conversationHoldTimer);
    conversationHoldTimer = null;
    heldConversationOption = null;
    conversationHoldOrigin = null;
  }

  sidebar.addEventListener('pointerdown', (event) => {
    const option = event.target.closest('.message-gamer-option');
    if (!option || event.button !== 0 || isRemovingConversation) return;
    cancelConversationHold();
    heldConversationOption = option;
    conversationHoldOrigin = { x: event.clientX, y: event.clientY };
    conversationHoldTimer = window.setTimeout(() => {
      if (!option.isConnected) return;
      selectConversationForDeletion(option);
      suppressConversationClick = true;
      window.clearTimeout(suppressClickTimer);
      suppressClickTimer = window.setTimeout(() => {
        suppressConversationClick = false;
      }, 1000);
    }, 550);
  });
  sidebar.addEventListener('pointerup', cancelConversationHold);
  sidebar.addEventListener('pointercancel', cancelConversationHold);
  sidebar.addEventListener('pointermove', (event) => {
    if (
      heldConversationOption
      && conversationHoldOrigin
      && (
        Math.abs(event.clientX - conversationHoldOrigin.x) > 12
        || Math.abs(event.clientY - conversationHoldOrigin.y) > 12
      )
    ) cancelConversationHold();
  });
  sidebar.addEventListener('click', (event) => {
    if (!suppressConversationClick || !event.target.closest('.message-gamer-option')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    suppressConversationClick = false;
    window.clearTimeout(suppressClickTimer);
  }, true);
  sidebar.addEventListener('contextmenu', (event) => {
    const option = event.target.closest('.message-gamer-option');
    if (!option) return;
    event.preventDefault();
    selectConversationForDeletion(option);
  });
  function dismissConversationSelection(event) {
    if (
      suppressConversationClick
      && event.target.closest('.message-gamer-option')
    ) {
      suppressConversationClick = false;
      window.clearTimeout(suppressClickTimer);
    }
    if (!selectedConversation || event.target.closest('#messages-delete-button')) return;
    if (event.target.closest('.message-gamer-option') === selectedConversationOption) return;
    clearConversationSelection();
    showMessageStatus(conversationsStatus, '');
  }

  clearCurrentConversationSelection = (event = null) => {
    if (event) dismissConversationSelection(event);
    else {
      clearConversationSelection();
      showMessageStatus(conversationsStatus, '');
    }
  };

  async function searchGamers() {
    const requestId = ++friendSearchRequestId;
    const term = searchInput.value.trim();
    searchResults.replaceChildren();
    showMessageStatus(searchStatus, term ? 'Searching gamers...' : 'Loading gamers...');

    try {
      const profiles = await getMessageContacts(term);
      if (requestId !== friendSearchRequestId
        || thisViewId !== messageViewId
        || searchInput.value.trim() !== term
        || friendFinder.hidden) return;
      showMessageStatus(
        searchStatus,
        profiles.length
          ? ''
          : (term
            ? 'No registered gamers match that name.'
            : 'No other gamers have signed in to Gamer Studio yet.')
      );
      for (const profile of profiles) {
        const row = document.createElement('div');
        row.className = 'friend-gamer-row';
        row.classList.toggle('is-online', activeGamerIds.has(profile.id));
        const openButton = document.createElement('button');
        openButton.type = 'button';
        openButton.className = 'friend-gamer-open';
        openButton.setAttribute('aria-label', `Message ${profile.username || 'Gamer'}`);
        openButton.appendChild(createMessageAvatar(profile));
        const name = document.createElement('span');
        name.className = 'friend-gamer-name';
        name.textContent = profile.username || 'Gamer';
        openButton.appendChild(name);
        openButton.addEventListener('click', () => {
          friendFinder.hidden = true;
          messagesSearchButton?.setAttribute('aria-expanded', 'false');
          openConversation(profile);
        });
        const addButton = document.createElement('button');
        addButton.type = 'button';
        addButton.className = 'friend-request-button';
        addButton.setAttribute('aria-label', `Send ${profile.username || 'Gamer'} a friend request`);
        addButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg><span>Add</span>';
        addButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          addButton.disabled = true;
          try {
            const result = await sendFriendRequest(profile.id);
            const labels = {
              request_sent: 'Requested',
              request_received: 'Request received',
              friends: 'Friends'
            };
            addButton.querySelector('span').textContent = labels[result] || 'Requested';
            addButton.classList.add('is-requested');
            addButton.setAttribute('aria-label', `${labels[result] || 'Request sent'}: ${profile.username || 'Gamer'}`);
          } catch (error) {
            console.error('Unable to send friend request:', error);
            showMessageStatus(
              searchStatus,
              error.message || 'The friend request could not be sent. Please try again.',
              true
            );
            addButton.disabled = false;
          }
        });
        row.append(openButton, addButton);
        searchResults.appendChild(row);
      }
    } catch (error) {
      console.error('Unable to search gamers:', error);
      const schemaErrorCodes = new Set(['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205']);
      const missingSchema = schemaErrorCodes.has(error?.code)
        || /could not find the function .* in the schema cache|relation .* does not exist|function .* does not exist|column .* does not exist/i
          .test(error?.message || '');
      showMessageStatus(
        searchStatus,
        missingSchema
          ? 'Gamers could not be searched because the Supabase schema is out of date. Run the latest supabase-schema.sql in the Supabase SQL Editor, then reload the app.'
          : `Gamers could not be searched: ${error?.message || 'check your connection and try again.'}`,
        true
      );
    }
  }

  async function refreshConversations() {
    const [conversationResult, friendsResult] = await Promise.allSettled([
      getMessageConversations(),
      getAcceptedFriends()
    ]);
    if (thisViewId !== messageViewId) return;

    const conversations = conversationResult.status === 'fulfilled'
      ? conversationResult.value
      : [];
    const friends = friendsResult.status === 'fulfilled'
      ? friendsResult.value
      : [];
    const conversationLoadError = conversationResult.status === 'rejected'
      ? conversationResult.reason
      : null;
    const friendLoadError = friendsResult.status === 'rejected'
      ? friendsResult.reason
      : null;
    if (conversationLoadError) {
      console.error('Unable to load direct conversations:', conversationLoadError);
    }
    if (friendLoadError) {
      console.error('Unable to load accepted friends:', friendLoadError);
    }

    let groups = [];
    let groupLoadError = null;
    try {
      groups = await getGroupConversations();
    } catch (error) {
      console.error('Unable to load group conversations:', error);
      groupLoadError = error;
    }
    if (thisViewId !== messageViewId) return;

    clearConversationSelection();
    friendsList.replaceChildren();
    conversationsList.replaceChildren();
    const conversationsById = new Map(
      conversations.map((conversation) => [conversation.id, conversation])
    );
    const sortedFriends = friends
      .map((friend) => ({
        ...friend,
        latestMessage: conversationsById.get(friend.id)?.latestMessage
      }))
      .sort((left, right) => (
        (right.latestMessage?.created_at || '').localeCompare(left.latestMessage?.created_at || '')
        || (left.username || '').localeCompare(right.username || '')
      ));
    for (const friend of sortedFriends) {
      const option = createGamerOption(
        friend,
        openConversation,
        friend.latestMessage?.content || 'Start a conversation'
      );
      option.classList.add('is-friend');
      option.classList.toggle('is-active', activePeerId === friend.id);
      option.classList.toggle(
        'has-unread-message',
        Boolean(
          friend.latestMessage?.recipient_id === currentUserId
          && !friend.latestMessage?.read_at
        )
      );
      friendsList.appendChild(option);
    }

    const friendIds = new Set(friends.map((friend) => friend.id));
    const combined = [
      ...conversations
        .filter((conversation) => !friendIds.has(conversation.id))
        .map((conversation) => ({ ...conversation, isGroup: false })),
      ...groups
    ].sort((left, right) => (
      (right.latestMessage?.created_at || '').localeCompare(left.latestMessage?.created_at || '')
      || (left.username || left.name || '').localeCompare(right.username || right.name || '')
    ));
    showMessageStatus(
      conversationsStatus,
      friendLoadError && conversationLoadError
        ? 'Friends and recent chats could not be loaded. Check your connection and try again.'
        : friendLoadError
          ? 'Friends could not be loaded. Your recent chats are still available.'
          : conversationLoadError
            ? 'Recent chats could not be loaded. Your friends are still available.'
        : (sortedFriends.length ? '' : 'You have not added any friends yet.'),
      Boolean(friendLoadError || conversationLoadError)
    );
    if (
      !sortedFriends.length
      && !combined.length
      && !friendLoadError
      && !conversationLoadError
      && !groupLoadError
    ) {
      showMessageStatus(
        conversationsStatus,
        'No friends or conversations yet. Search for a gamer or create a squad.'
      );
    }
    if (groupLoadError) {
      console.error('Unable to load group chats:', groupLoadError);
    }
    for (const conversation of combined) {
      const optionProfile = conversation.isGroup
        ? { ...conversation, username: conversation.name, avatar_url: conversation.avatar_url || '' }
        : conversation;
      const preview = conversation.latestMessage?.content
        || (conversation.isGroup ? 'Group conversation' : '');
      const option = createGamerOption(
        optionProfile,
        conversation.isGroup
          ? (group) => openGroupConversation(group)
          : openConversation,
        preview
      );
      if (conversation.isGroup) option.dataset.groupId = conversation.id;
      option.classList.toggle(
        'is-active',
        conversation.isGroup
          ? activeGroup?.id === conversation.id
          : activePeerId === conversation.id
      );
      option.classList.toggle(
        'has-unread-message',
        Boolean(
          !conversation.isGroup
          && conversation.latestMessage?.recipient_id === currentUserId
          && !conversation.latestMessage?.read_at
        )
      );
      conversationsList.appendChild(option);
    }
  }

  function showCreateGroupDialog() {
    const overlay = document.createElement('section');
    overlay.className = 'group-create-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'group-create-title');
    const panel = document.createElement('form');
    panel.className = 'group-create-panel';
    const title = document.createElement('h2');
    title.id = 'group-create-title';
    title.textContent = 'Create squad';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Squad name';
    nameInput.maxLength = 60;
    nameInput.required = true;
    nameInput.setAttribute('aria-label', 'Squad name');
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = 'Find gamers to add';
    searchInput.setAttribute('aria-label', 'Find gamers to add');
    const status = document.createElement('p');
    status.className = 'group-create-status';
    status.setAttribute('role', 'status');
    const membersList = document.createElement('div');
    membersList.className = 'group-create-members';
    const actions = document.createElement('div');
    actions.className = 'group-create-actions';
    const cancelButton = document.createElement('button');
    cancelButton.type = 'button';
    cancelButton.textContent = 'Cancel';
    const createButton = document.createElement('button');
    createButton.type = 'submit';
    createButton.textContent = 'Create squad';
    createButton.disabled = true;
    const selectedIds = new Set();
    let resultProfiles = [];
    let requestNumber = 0;

    const updateSelectedLabel = () => {
      createButton.disabled = selectedIds.size === 0;
      createButton.textContent = selectedIds.size
        ? `Create squad (${selectedIds.size})`
        : 'Create squad';
    };
    const searchMembers = async () => {
      const currentRequest = ++requestNumber;
      status.textContent = searchInput.value.trim() ? 'Searching gamers...' : 'Loading gamers...';
      try {
        resultProfiles = await getMessageContacts(searchInput.value.trim());
        if (currentRequest !== requestNumber) return;
        membersList.replaceChildren();
        const otherGamers = resultProfiles.filter((profile) => profile.id !== currentUserId);
        status.textContent = otherGamers.length ? '' : 'No gamers found.';
        for (const profile of otherGamers) {
          const label = document.createElement('label');
          label.className = 'group-create-member';
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = selectedIds.has(profile.id);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) selectedIds.add(profile.id);
            else selectedIds.delete(profile.id);
            updateSelectedLabel();
          });
          const avatar = createMessageAvatar(profile);
          const gamerName = document.createElement('span');
          gamerName.textContent = profile.username || 'Gamer';
          label.append(checkbox, avatar, gamerName);
          membersList.appendChild(label);
        }
      } catch (error) {
        console.error('Unable to search group members:', error);
        status.textContent = error.message || 'Gamers could not be loaded. Please try again.';
      }
    };

    cancelButton.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) overlay.remove();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') overlay.remove();
    });
    searchInput.addEventListener('input', searchMembers);
    panel.addEventListener('submit', async (event) => {
      event.preventDefault();
      createButton.disabled = true;
      cancelButton.disabled = true;
      status.textContent = 'Creating your squad...';
      try {
        const group = await createGroupChat(nameInput.value, [...selectedIds]);
        overlay.remove();
        await refreshConversations();
        await openGroupConversation(group);
      } catch (error) {
        console.error('Unable to create group chat:', error);
        status.textContent = error.message || 'The squad could not be created. Please try again.';
        cancelButton.disabled = false;
        updateSelectedLabel();
      }
    });
    actions.append(cancelButton, createButton);
    panel.append(title, nameInput, searchInput, status, membersList, actions);
    overlay.appendChild(panel);
    sectionView.appendChild(overlay);
    nameInput.focus();
    searchMembers();
  }

  const messageReactionOptions = [
    '👍', '❤️', '😂', '🔥', '😮'
  ];
  let messagePressTimer = null;

  function renderMessageReactions(bubble, message, messagesElement, statusElement, expectedViewId) {
    const reactionCounts = new Map();
    for (const reaction of message.reactions || []) {
      const current = reactionCounts.get(reaction.emoji) || { count: 0, isOwnReaction: false };
      current.count += 1;
      current.isOwnReaction ||= reaction.isOwnReaction;
      reactionCounts.set(reaction.emoji, current);
    }
    if (!reactionCounts.size) return;

    const reactionList = document.createElement('div');
    reactionList.className = 'message-reactions';
    reactionList.setAttribute('aria-label', 'Message reactions');
    for (const [emoji, reaction] of reactionCounts) {
      const reactionButton = document.createElement('button');
      reactionButton.type = 'button';
      reactionButton.className = 'message-reaction';
      reactionButton.classList.toggle('is-own-reaction', reaction.isOwnReaction);
      reactionButton.setAttribute('aria-pressed', String(reaction.isOwnReaction));
      reactionButton.setAttribute('aria-label', `${emoji}, ${reaction.count} reactions`);
      reactionButton.textContent = `${emoji} ${reaction.count}`;
      reactionButton.addEventListener('click', async () => {
        reactionButton.disabled = true;
        try {
          if (activeGroup) await toggleGroupMessageReaction(message.id, emoji);
          else await toggleDirectMessageReaction(message.id, emoji);
          await loadThread(messagesElement, statusElement, expectedViewId);
        } catch (error) {
          console.error('Unable to update message reaction:', error);
          showMessageStatus(statusElement, error.message || 'The reaction could not be updated.', true);
          reactionButton.disabled = false;
        }
      });
      reactionList.appendChild(reactionButton);
    }
    bubble.appendChild(reactionList);
  }

  function closeMessageActions(messagesElement) {
    const chat = messagesElement.closest('.messages-chat');
    chat?.querySelectorAll('.message-actions').forEach((actions) => actions.remove());
    messagesElement.querySelectorAll('.message-bubble.is-actions-open').forEach((bubble) => {
      bubble.classList.remove('is-actions-open');
    });
    chat?.classList.remove('has-message-actions');
  }

  function showMessageActions(bubble, message, messagesElement, statusElement, expectedViewId) {
    closeMessageActions(messagesElement);
    bubble.classList.add('is-actions-open');

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    actions.setAttribute('role', 'group');
    actions.setAttribute('aria-label', 'Message actions');
    const reactionPicker = document.createElement('div');
    reactionPicker.className = 'message-reaction-picker';
    reactionPicker.setAttribute('aria-label', 'Choose a reaction');
    for (const emoji of messageReactionOptions) {
      const reactionButton = document.createElement('button');
      reactionButton.type = 'button';
      reactionButton.className = 'message-action-reaction';
      reactionButton.textContent = emoji;
      reactionButton.setAttribute('aria-label', `React with ${emoji}`);
      reactionButton.addEventListener('click', async () => {
        reactionButton.disabled = true;
        try {
          if (activeGroup) await toggleGroupMessageReaction(message.id, emoji);
          else await toggleDirectMessageReaction(message.id, emoji);
          await loadThread(messagesElement, statusElement, expectedViewId);
        } catch (error) {
          console.error('Unable to update message reaction:', error);
          showMessageStatus(statusElement, error.message || 'The reaction could not be updated.', true);
          reactionButton.disabled = false;
        }
      });
      reactionPicker.appendChild(reactionButton);
    }
    actions.appendChild(reactionPicker);

    const replyRow = document.createElement('div');
    replyRow.className = 'message-action-reply-row';
    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'message-action-button message-action-reply';
    replyButton.setAttribute('aria-label', 'Reply to message');
    replyButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.7" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2" />
</svg><span>Reply</span>`;
    replyButton.addEventListener('click', () => {
      messagesElement.replyToMessage?.(message);
      closeMessageActions(messagesElement);
    });
    replyRow.appendChild(replyButton);
    actions.appendChild(replyRow);

    if (message.isOwnMessage) {
      const editDelete = document.createElement('div');
      editDelete.className = 'message-action-edit-delete';
      if (message.content && !activeGroup) {
        const editButton = document.createElement('button');
        editButton.type = 'button';
        editButton.className = 'message-action-button';
        editButton.setAttribute('aria-label', 'Edit message');
        editButton.title = 'Edit message';
        editButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
</svg>`;
        editButton.addEventListener('click', () => {
          const editor = document.createElement('form');
          editor.className = 'message-edit-form';
          const editInput = document.createElement('textarea');
          editInput.maxLength = 2000;
          editInput.rows = 3;
          editInput.value = message.content;
          editInput.setAttribute('aria-label', 'Edit message');
          const editActions = document.createElement('div');
          editActions.className = 'message-edit-actions';
          const cancelButton = document.createElement('button');
          cancelButton.type = 'button';
          cancelButton.className = 'message-edit-cancel';
          cancelButton.textContent = 'Cancel';
          cancelButton.addEventListener('click', () => loadThread(messagesElement, statusElement, expectedViewId));
          const saveButton = document.createElement('button');
          saveButton.type = 'submit';
          saveButton.textContent = 'Save';
          editActions.append(cancelButton, saveButton);
          editor.append(editInput, editActions);
          bubble.replaceChildren(editor);
          editInput.focus();
          editInput.setSelectionRange(editInput.value.length, editInput.value.length);
          editor.addEventListener('submit', async (event) => {
            event.preventDefault();
            saveButton.disabled = true;
            try {
              await updateDirectMessage(message.id, editInput.value);
              await loadThread(messagesElement, statusElement, expectedViewId);
            } catch (error) {
              console.error('Unable to edit direct message:', error);
              showMessageStatus(statusElement, error.message || 'The message could not be edited.', true);
              saveButton.disabled = false;
            }
          });
        });
        editDelete.appendChild(editButton);
      }

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'message-action-button is-destructive';
      deleteButton.setAttribute('aria-label', 'Delete message');
      deleteButton.title = 'Delete message';
      deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
</svg>`;
      deleteButton.addEventListener('click', () => {
        const confirmation = document.createElement('div');
        confirmation.className = 'message-delete-confirmation';
        const prompt = document.createElement('span');
        prompt.textContent = message.voice_path
          ? 'Delete this voice note?'
          : 'Delete this message?';
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.addEventListener('click', () => closeMessageActions(messagesElement));
        const confirmButton = document.createElement('button');
        confirmButton.type = 'button';
        confirmButton.className = 'is-destructive';
        confirmButton.textContent = 'Delete';
        confirmButton.addEventListener('click', async () => {
          confirmButton.disabled = true;
          try {
            if (activeGroup) await deleteGroupMessage(message.id);
            else await deleteDirectMessage(message.id);
            await loadThread(messagesElement, statusElement, expectedViewId);
            await refreshConversations();
          } catch (error) {
            console.error('Unable to delete direct message:', error);
            await loadThread(messagesElement, statusElement, expectedViewId);
            await refreshConversations();
            showMessageStatus(statusElement, error.message || 'The message could not be deleted.', true);
            confirmButton.disabled = false;
          }
        });
        confirmation.append(prompt, cancelButton, confirmButton);
        actions.replaceChildren(confirmation);
      });
      editDelete.appendChild(deleteButton);
      actions.appendChild(editDelete);
    }

    const chat = messagesElement.closest('.messages-chat');
    chat?.appendChild(actions);
    chat?.classList.add('has-message-actions');
    const rect = bubble.getBoundingClientRect();
    const positionActions = () => {
      if (!actions.isConnected) return;
      const margin = 8;
      const actionRect = actions.getBoundingClientRect();
      const actionWidth = actionRect.width;
      const actionHeight = actionRect.height;
      const alignedLeft = bubble.classList.contains('own-message')
        ? rect.right - actionWidth
        : rect.left;
      const left = Math.max(margin, Math.min(alignedLeft, window.innerWidth - actionWidth - margin));
      const above = rect.top - actionHeight - margin;
      const below = rect.bottom + margin;
      const top = above >= margin
        ? above
        : Math.min(below, window.innerHeight - actionHeight - margin);
      actions.style.left = `${left}px`;
      actions.style.top = `${Math.max(margin, top)}px`;
      actions.style.right = 'auto';
    };
    requestAnimationFrame(positionActions);
    requestAnimationFrame(() => {
      const actionRect = actions.getBoundingClientRect();
      if (actionRect.bottom > window.innerHeight - 8 || actionRect.right > window.innerWidth - 8) {
        positionActions();
      }
    });
  }

  function showMessageActionsForTarget(target, messagesElement, statusElement, expectedViewId) {
    const bubble = target.closest('.message-bubble');
    if (!bubble) return;
    const message = bubble.messageData;
    if (message) {
      showMessageActions(bubble, message, messagesElement, statusElement, expectedViewId);
    }
  }

  async function loadThread(messagesElement, statusElement, expectedViewId) {
    try {
      window.clearTimeout(messagePressTimer);
      const messages = activeGroup
        ? await getGroupMessages(activeGroup.id)
        : await getDirectMessages(activePeerId);
      if (expectedViewId !== activeThread || thisViewId !== messageViewId) return;
      closeMessageActions(messagesElement);
      messagesElement.replaceChildren();
      if (!messages.length) {
        const emptyThread = document.createElement('p');
        emptyThread.className = 'messages-thread-empty';
        emptyThread.textContent = activeGroup
          ? `Start the conversation in ${activeGroup.name}.`
          : `Say hello to ${activePeer.username || 'this gamer'} to start the conversation.`;
        messagesElement.appendChild(emptyThread);
      }
      for (const message of messages) {
        const bubble = document.createElement('article');
        bubble.className = `message-bubble${message.isOwnMessage ? ' own-message' : ''}`;
        bubble.tabIndex = 0;
        bubble.setAttribute('aria-label', message.isOwnMessage ? 'Your message. Open message actions.' : 'Message. Open reaction actions.');
        bubble.messageData = message;
        const copy = document.createElement('p');
        let hasCopyContent = false;
        if (message.reply) {
          const quote = document.createElement('span');
          quote.className = 'message-reply-quote';
          quote.textContent = `${message.reply.senderName || 'Gamer'}: ${message.reply.content || 'Voice note'}`;
          copy.append(quote);
          hasCopyContent = true;
        }
        if (message.content) {
          copy.append(document.createTextNode(message.content));
          hasCopyContent = true;
        }
        let voicePlayer = null;
        if (message.voice_url) {
          voicePlayer = createVoiceNotePlayer(
            message.voice_url,
            (messageText) => showMessageStatus(statusElement, messageText, true),
            message.voice_path || message.id,
            message.voice_path ? () => refreshVoiceNoteUrl(message.voice_path) : null
          );
        }
        let messageMedia = null;
        if (message.media_url) {
          messageMedia = message.media_type === 'video'
            ? document.createElement('video')
            : document.createElement('img');
          messageMedia.className = 'message-media-attachment';
          messageMedia.src = message.media_url;
          if (messageMedia instanceof HTMLVideoElement) {
            messageMedia.controls = true;
            messageMedia.preload = 'metadata';
            messageMedia.playsInline = true;
          } else {
            messageMedia.alt = 'Image attachment';
            messageMedia.loading = 'lazy';
            messageMedia.decoding = 'async';
          }
        }
        if (activeGroup) {
          const sender = document.createElement('span');
          sender.className = 'message-sender-name';
          sender.textContent = message.senderName || 'Gamer';
          bubble.appendChild(sender);
        }
        const time = document.createElement('time');
        time.dateTime = message.created_at;
        time.textContent = new Date(message.created_at).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
        if (hasCopyContent) bubble.appendChild(copy);
        if (voicePlayer || message.voice_error) {
          if (voicePlayer) bubble.appendChild(voicePlayer.element);
        }
        if (message.voice_error) {
          const voiceError = document.createElement('span');
          voiceError.className = 'message-attachment-error';
          voiceError.textContent = `Voice note unavailable: ${message.voice_error}`;
          bubble.appendChild(voiceError);
        }
        if (messageMedia) bubble.appendChild(messageMedia);
        if (message.media_error) {
          const mediaError = document.createElement('span');
          mediaError.className = 'message-attachment-error';
          mediaError.textContent = `Attachment unavailable: ${message.media_error}`;
          bubble.appendChild(mediaError);
        }
        bubble.appendChild(time);
        if (message.edited_at) {
          const editedLabel = document.createElement('span');
          editedLabel.className = 'message-edited-label';
          editedLabel.textContent = 'Edited';
          time.append(' · ', editedLabel);
        }
        renderMessageReactions(bubble, message, messagesElement, statusElement, expectedViewId);
        messagesElement.appendChild(bubble);
      }
      messagesElement.scrollTop = messagesElement.scrollHeight;
      showMessageStatus(statusElement, '');
    } catch (error) {
      console.error('Unable to load conversation messages:', error);
      showMessageStatus(
        statusElement,
        error.message || 'Messages could not be loaded. Check your connection and try again.',
        true
      );
    }
  }

  async function openConversation(profile, group = null) {
    if (!profile?.id || profile.id === currentUserId) return;
    clearConversationSelection();
    activePeerId = group ? null : profile.id;
    activePeer = profile;
    activeGroup = group;
    activeThread += 1;
    layout.querySelectorAll('.message-gamer-option').forEach((option) => {
      option.classList.toggle(
        'is-active',
        group
          ? option.dataset.groupId === group.id
          : option.dataset.gamerId === profile.id
      );
    });
    const threadId = activeThread;
    closeMessageChannel();
    document.body.dataset.chatOpen = 'true';
    layout.dataset.chatOpen = 'true';
    sectionView.classList.add('messages-conversation-open');
    chat.replaceChildren();

    const header = document.createElement('header');
    header.className = 'messages-chat-header';
    const backButton = document.createElement('button');
    backButton.type = 'button';
    backButton.className = 'messages-back-button';
    backButton.setAttribute('aria-label', 'Back to messages');
    backButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m15 18-6-6 6-6" /></svg>`;
    backButton.addEventListener('click', () => {
      document.body.dataset.chatOpen = 'false';
      layout.dataset.chatOpen = 'false';
      sectionView.classList.remove('messages-conversation-open');
      chat.replaceChildren(chatEmpty);
      activePeerId = null;
      activePeer = null;
      activeGroup = null;
      activeThread += 1;
      window.clearTimeout(typingIdleTimer);
      closeMessageChannel();
      refreshConversations();
    });
    const peerHeading = document.createElement('div');
    peerHeading.className = 'messages-peer-heading';
    let peerAvatar = createMessageAvatar(profile, 'message-avatar message-peer-avatar');
    const peerDetails = document.createElement('div');
    peerDetails.className = 'messages-peer-details';
    const peerName = document.createElement('h3');
    peerName.textContent = profile.username || 'Gamer';
    const typingIndicator = document.createElement('p');
    typingIndicator.className = 'messages-typing-indicator';
    typingIndicator.hidden = true;
    typingIndicator.setAttribute('aria-live', 'polite');
    typingIndicator.innerHTML = '<span class="messages-typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
    peerDetails.append(peerName, typingIndicator);
    let groupPictureInput = null;
    let groupAvatarButton = null;
    if (activeGroup?.created_by === currentUserId) {
      groupPictureInput = document.createElement('input');
      groupPictureInput.type = 'file';
      groupPictureInput.accept = 'image/*';
      groupPictureInput.hidden = true;
      groupPictureInput.setAttribute('aria-label', 'Choose squad picture');
      groupAvatarButton = document.createElement('button');
      groupAvatarButton.type = 'button';
      groupAvatarButton.className = 'messages-group-avatar-button';
      groupAvatarButton.setAttribute('aria-label', 'Change squad profile picture');
      groupAvatarButton.title = 'Click to change squad picture';
      groupAvatarButton.appendChild(peerAvatar);
      groupAvatarButton.addEventListener('click', () => groupPictureInput.click());
      groupPictureInput.addEventListener('change', async () => {
        const [file] = groupPictureInput.files || [];
        if (!file) return;
        groupAvatarButton.disabled = true;
        try {
          const updatedGroup = await uploadGroupPicture(activeGroup.id, file);
          activeGroup.avatar_url = updatedGroup.avatar_url;
          profile.avatar_url = updatedGroup.avatar_url;
          const updatedPeerAvatar = createMessageAvatar(
            profile,
            'message-avatar message-peer-avatar'
          );
          peerAvatar.replaceWith(updatedPeerAvatar);
          peerAvatar = updatedPeerAvatar;
          await refreshConversations();
          showMessageStatus(status, 'Squad picture updated.');
        } catch (error) {
          console.error('Unable to update squad picture:', error);
          showMessageStatus(
            status,
            error.message || 'The squad picture could not be updated. Please try again.',
            true
          );
        } finally {
          groupAvatarButton.disabled = false;
          groupPictureInput.value = '';
        }
      });
      peerHeading.append(groupAvatarButton, peerDetails);
      header.append(backButton, peerHeading, groupPictureInput);
    } else {
      peerHeading.append(peerAvatar, peerDetails);
      header.append(backButton, peerHeading);
    }

    const status = document.createElement('p');
    status.className = 'messages-thread-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    showMessageStatus(status, 'Loading messages...');
    const thread = document.createElement('div');
    thread.className = 'messages-thread';
    thread.setAttribute('role', 'log');
    thread.setAttribute('aria-label', `Conversation with ${profile.username || 'Gamer'}`);
    thread.setAttribute('aria-live', 'polite');
    const replyPreview = document.createElement('div');
    replyPreview.className = 'message-reply-preview';
    replyPreview.hidden = true;
    const replyCopy = document.createElement('span');
    replyCopy.className = 'message-reply-preview-copy';
    const cancelReply = document.createElement('button');
    cancelReply.type = 'button';
    cancelReply.className = 'message-reply-cancel';
    cancelReply.setAttribute('aria-label', 'Cancel reply');
    cancelReply.textContent = '×';
    replyPreview.append(replyCopy, cancelReply);
    let replyToMessage = null;
    let threadPresenceReady = false;
    let localTypingActive = false;
    let localVoiceRecording = false;
    let typingIdleTimer = 0;
    let voiceRecorder = null;
    let voiceStream = null;
    let voiceChunks = [];
    let voiceBlob = null;
    let voiceObjectUrl = '';
    let voiceExtension = '';
    let messageAttachment = null;
    let attachmentObjectUrl = '';
    let voicePointerDown = false;
    let voiceLocked = false;
    let voiceIgnoreClick = false;
    let voicePointerStartX = 0;
    let voiceRecordingRequestId = 0;
    let voiceRecorderToken = 0;
    const updateTypingIndicator = () => {
      const presenceState = currentMessageChannel?.presenceState() || {};
      const activeUsers = Object.values(presenceState)
        .flat()
        .filter((presence) => presence.user_id !== currentUserId && (presence.typing || presence.recording_voice));
      typingIndicator.hidden = activeUsers.length === 0;
      const label = typingIndicator.lastElementChild;
      if (label) {
        const recordingUsers = activeUsers.filter((presence) => presence.recording_voice);
        const usersToShow = recordingUsers.length ? recordingUsers : activeUsers;
        const activity = recordingUsers.length ? 'recording a voice note' : 'typing';
        label.textContent = activeGroup && usersToShow.length > 1
          ? `Several people are ${activity}...`
          : `${activeGroup ? (usersToShow[0]?.username || 'Someone') : (profile.username || 'Gamer')} is ${activity}...`;
      }
    };
    const publishPresence = async () => {
      if (!threadPresenceReady || !currentMessageChannel) return;
      try {
        const result = await currentMessageChannel.track({
          user_id: currentUserId,
          username: FULLNAME?.textContent.trim() || 'Gamer',
          typing: localTypingActive,
          recording_voice: localVoiceRecording
        });
        if (result !== 'ok') console.warn('Unable to update typing status:', result);
      } catch (error) {
        console.warn('Unable to update typing status:', error);
      }
    };
    const publishTyping = (typing) => {
      localTypingActive = typing;
      return publishPresence();
    };
    const publishVoiceRecording = (recording) => {
      localVoiceRecording = recording;
      return publishPresence();
    };
    const stopTyping = () => {
      window.clearTimeout(typingIdleTimer);
      typingIdleTimer = 0;
      if (localTypingActive) publishTyping(false);
    };
    const clearReply = () => {
      replyToMessage = null;
      replyPreview.hidden = true;
      replyCopy.textContent = '';
    };
    const chooseReply = (message) => {
      replyToMessage = message;
      replyCopy.textContent = `Replying to ${message.senderName || (message.isOwnMessage ? 'your message' : profile.username || 'Gamer')}: ${message.content || 'Voice note'}`;
      replyPreview.hidden = false;
      input.focus();
    };
    thread.replyToMessage = chooseReply;
    cancelReply.addEventListener('click', clearReply);
    thread.addEventListener('pointerdown', (event) => {
      if (
        event.pointerType !== 'touch'
        || !event.target.closest('.message-bubble')
        || event.target.closest('.message-actions')
      ) return;
      window.clearTimeout(messagePressTimer);
      const target = event.target;
      messagePressOrigin = { x: event.clientX, y: event.clientY };
      thread.replyGesture = {
        x: event.clientX,
        y: event.clientY,
        target,
        bubble: target.closest('.message-bubble'),
        moved: false
      };
      chat.classList.add('is-message-pressing');
      messagePressTimer = window.setTimeout(
        () => {
          chat.classList.remove('is-message-pressing');
          showMessageActionsForTarget(target, thread, status, threadId);
        },
        500
      );
    });
    thread.addEventListener('pointerup', (event) => {
      window.clearTimeout(messagePressTimer);
      const gesture = thread.replyGesture;
      if (gesture && event.pointerType === 'touch') {
        const deltaX = event.clientX - gesture.x;
        const deltaY = event.clientY - gesture.y;
        if (Math.abs(deltaX) > 32 && Math.abs(deltaX) > Math.abs(deltaY) * 1.1) {
          const bubble = gesture.bubble;
          if (bubble?.messageData) {
            chooseReply(bubble.messageData);
          }
        }
      }
      thread.querySelectorAll('.message-bubble.is-swiping-to-reply').forEach((bubble) => {
        bubble.classList.add('is-swipe-settling');
        bubble.classList.remove('is-swiping-to-reply');
        bubble.style.transform = '';
        window.setTimeout(() => bubble.classList.remove('is-swipe-settling'), 240);
      });
      thread.replyGesture = null;
      chat.classList.remove('is-message-pressing');
      messagePressOrigin = null;
    }, { passive: true });
    thread.addEventListener('pointercancel', () => {
      window.clearTimeout(messagePressTimer);
      thread.querySelectorAll('.message-bubble.is-swiping-to-reply').forEach((bubble) => {
        bubble.classList.add('is-swipe-settling');
        bubble.classList.remove('is-swiping-to-reply');
        bubble.style.transform = '';
        window.setTimeout(() => bubble.classList.remove('is-swipe-settling'), 240);
      });
      thread.replyGesture = null;
      chat.classList.remove('is-message-pressing');
      messagePressOrigin = null;
    }, { passive: true });
    thread.addEventListener('pointermove', (event) => {
      if (!messagePressOrigin) return;
      const deltaX = event.clientX - messagePressOrigin.x;
      const deltaY = event.clientY - messagePressOrigin.y;
      if (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12) {
        window.clearTimeout(messagePressTimer);
        chat.classList.remove('is-message-pressing');
        if (thread.replyGesture) thread.replyGesture.moved = true;
        if (
          Math.abs(deltaX) > Math.abs(deltaY) * 1.1
          && thread.replyGesture?.bubble
        ) {
          const distance = Math.max(-72, Math.min(72, deltaX));
          thread.replyGesture.bubble.classList.add('is-swiping-to-reply');
          thread.replyGesture.bubble.style.transform = `translateX(${distance}px)`;
        }
      }
    }, { passive: true });
    thread.addEventListener('contextmenu', (event) => {
      if (!event.target.closest('.message-bubble')) return;
      event.preventDefault();
      showMessageActionsForTarget(event.target, thread, status, threadId);
    });
    thread.addEventListener('click', (event) => {
      if (!event.target.closest('.message-bubble')) closeMessageActions(thread);
    });
    thread.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMessageActions(thread);
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const bubble = event.target.closest('.message-bubble');
        if (!bubble || event.target !== bubble) return;
        event.preventDefault();
        if (bubble.classList.contains('is-actions-open')) closeMessageActions(thread);
        else showMessageActionsForTarget(bubble, thread, status, threadId);
      }
    });

    const form = document.createElement('form');
    form.className = 'messages-composer';
    const input = document.createElement('textarea');
    input.maxLength = 2000;
    input.rows = 1;
    input.placeholder = 'Message...';
    input.setAttribute('aria-label', 'Write a message');
    const mediaInput = document.createElement('input');
    mediaInput.type = 'file';
    mediaInput.accept = 'image/*,video/*';
    mediaInput.hidden = true;
    mediaInput.setAttribute('aria-label', 'Choose an image or video');
    const mediaButton = document.createElement('button');
    mediaButton.type = 'button';
    mediaButton.className = 'message-attachment-button';
    mediaButton.setAttribute('aria-label', 'Add an image or video');
    mediaButton.title = 'Add an image or video';
    mediaButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
</svg>`;
    const attachmentPreview = document.createElement('div');
    attachmentPreview.className = 'message-attachment-preview';
    attachmentPreview.hidden = true;
    const attachmentPreviewContent = document.createElement('div');
    attachmentPreviewContent.className = 'message-attachment-preview-content';
    const removeAttachmentButton = document.createElement('button');
    removeAttachmentButton.type = 'button';
    removeAttachmentButton.className = 'message-attachment-remove';
    removeAttachmentButton.setAttribute('aria-label', 'Remove attachment');
    removeAttachmentButton.textContent = '×';
    attachmentPreview.append(attachmentPreviewContent, removeAttachmentButton);
    const voiceControls = document.createElement('div');
    voiceControls.className = 'voice-note-controls';
    voiceControls.hidden = true;
    const voiceStatus = document.createElement('span');
    voiceStatus.className = 'voice-note-status';
    voiceStatus.setAttribute('role', 'status');
    voiceStatus.setAttribute('aria-live', 'polite');
    const recordingWaveform = createVoiceWaveform('live-recording');
    recordingWaveform.hidden = true;
    const voicePreview = createVoiceNotePlayer('', (messageText) => {
      showMessageStatus(status, messageText, true);
    }, 'voice-preview');
    voicePreview.element.hidden = true;
    const discardVoiceButton = document.createElement('button');
    discardVoiceButton.type = 'button';
    discardVoiceButton.className = 'voice-note-delete';
    discardVoiceButton.setAttribute('aria-label', 'Delete voice note');
    discardVoiceButton.title = 'Delete voice note';
    discardVoiceButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
</svg>`;
    voiceControls.append(voiceStatus, recordingWaveform, voicePreview.element, discardVoiceButton);
    const sendButton = document.createElement('button');
    sendButton.type = 'submit';
    const micButton = document.createElement('button');
    micButton.type = 'button';
    micButton.dataset.action = 'mic';
    micButton.setAttribute('aria-label', 'Hold to record a voice note; swipe left to lock recording.');
    micButton.title = 'Hold to record a voice note — swipe left to lock';
    micButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="9" y="2" width="6" height="12" rx="3" />
  <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8" />
</svg>`;
    const setComposerAction = () => {
      const hasContent = Boolean(input.value.trim()) || Boolean(voiceBlob) || Boolean(messageAttachment);
      const inputFocused = document.activeElement === input;
      const showSend = inputFocused || Boolean(input.value.trim()) || Boolean(voiceBlob) || Boolean(messageAttachment);
      micButton.hidden = showSend;
      sendButton.hidden = !showSend;
      micButton.disabled = Boolean(messageAttachment);
      mediaButton.disabled = Boolean(voiceBlob) || voiceRecorder?.state === 'recording';
      sendButton.disabled = !hasContent || voiceRecorder?.state === 'recording';
      sendButton.setAttribute('aria-label', voiceBlob ? 'Send voice note' : messageAttachment ? 'Send attachment' : 'Send message');
      sendButton.title = voiceBlob ? 'Send voice note' : messageAttachment ? 'Send attachment' : 'Send message';
      sendButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
</svg>`;
    };
    const clearMessageAttachment = () => {
      if (attachmentObjectUrl) URL.revokeObjectURL(attachmentObjectUrl);
      attachmentObjectUrl = '';
      messageAttachment = null;
      attachmentPreviewContent.replaceChildren();
      attachmentPreview.hidden = true;
      mediaInput.value = '';
      setComposerAction();
    };
    clearActiveMessageAttachment = clearMessageAttachment;
    mediaButton.addEventListener('click', () => {
      if (voiceBlob || voiceRecorder?.state === 'recording') {
        showMessageStatus(status, 'Send or discard the voice note before attaching a file.', true);
        return;
      }
      mediaInput.click();
    });
    removeAttachmentButton.addEventListener('click', clearMessageAttachment);
    mediaInput.addEventListener('change', async () => {
      const file = mediaInput.files?.[0];
      if (!file) return;
      if (file.size > 100 * 1024 * 1024) {
        showMessageStatus(status, 'Choose a file smaller than 100 MB before compression.', true);
        mediaInput.value = '';
        return;
      }
      clearMessageAttachment();
      mediaButton.disabled = true;
      showMessageStatus(status, 'Compressing attachment…');
      try {
        messageAttachment = await compressMessageMedia(file);
        if (!form.isConnected) {
          messageAttachment = null;
          return;
        }
        attachmentObjectUrl = URL.createObjectURL(messageAttachment.blob);
        const preview = messageAttachment.contentType.startsWith('video/')
          ? document.createElement('video')
          : document.createElement('img');
        preview.src = attachmentObjectUrl;
        if (preview instanceof HTMLVideoElement) {
          preview.muted = true;
          preview.playsInline = true;
          preview.controls = true;
        } else {
          preview.alt = 'Selected image preview';
        }
        const fileLabel = document.createElement('span');
        fileLabel.textContent = `${file.name} · ${(messageAttachment.blob.size / (1024 * 1024)).toFixed(1)} MB`;
        attachmentPreviewContent.replaceChildren(preview, fileLabel);
        attachmentPreview.hidden = false;
        showMessageStatus(status, '');
        setComposerAction();
      } catch (error) {
        console.error('Unable to compress message attachment:', error);
        messageAttachment = null;
        showMessageStatus(status, error.message || 'The attachment could not be compressed.', true);
      } finally {
        mediaButton.disabled = false;
        mediaInput.value = '';
      }
    });
    const clearVoiceNote = () => {
      voiceRecordingRequestId += 1;
      if (localVoiceRecording) publishVoiceRecording(false);
      if (voiceRecorder) {
        voiceRecorderToken += 1;
        if (voiceRecorder.state === 'recording') voiceRecorder.stop();
        voiceRecorder = null;
      }
      voiceStream?.getTracks().forEach((track) => track.stop());
      voiceStream = null;
      if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
      voiceObjectUrl = '';
      voiceBlob = null;
      voiceExtension = '';
      voiceChunks = [];
      voicePreview.reset();
      voicePreview.element.hidden = true;
      recordingWaveform.hidden = true;
      recordingWaveform.classList.remove('is-recording');
      voiceControls.hidden = true;
      discardVoiceButton.hidden = true;
      voiceStatus.textContent = '';
      voiceLocked = false;
      voicePointerDown = false;
      micButton.classList.remove('is-recording');
      micButton.setAttribute('aria-label', 'Hold to record a voice note; swipe left to lock recording.');
      micButton.title = 'Hold to record a voice note — swipe left to lock';
      input.hidden = false;
      sendButton.disabled = false;
      setComposerAction();
    };
    clearActiveVoiceNote = clearVoiceNote;
    const stopVoiceRecording = () => {
      if (voiceRecorder?.state === 'recording') voiceRecorder.stop();
    };
    const startVoiceRecording = async () => {
      if (voiceRecorder || voiceBlob || messageAttachment) return;
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        showMessageStatus(status, 'Voice recording is not supported by this browser. Try the latest version of Chrome, Firefox, or Safari.', true);
        return;
      }
      const requestId = ++voiceRecordingRequestId;
      try {
        voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (requestId !== voiceRecordingRequestId) {
          voiceStream.getTracks().forEach((track) => track.stop());
          voiceStream = null;
          return;
        }
        const mimeTypes = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'];
        const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
          ? mimeTypes.find((type) => MediaRecorder.isTypeSupported(type))
          : null;
        voiceRecorder = mimeType
          ? new MediaRecorder(voiceStream, { mimeType, audioBitsPerSecond: 32000 })
          : new MediaRecorder(voiceStream, { audioBitsPerSecond: 32000 });
        const recorderToken = ++voiceRecorderToken;
        voiceExtension = voiceRecorder.mimeType.includes('ogg')
          ? 'ogg'
          : voiceRecorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
        voiceChunks = [];
        voiceControls.hidden = false;
        voicePreview.element.hidden = true;
        recordingWaveform.hidden = false;
        recordingWaveform.classList.add('is-recording');
        discardVoiceButton.hidden = false;
        input.hidden = true;
        voiceStatus.textContent = 'Recording';
        sendButton.disabled = true;
        micButton.setAttribute('aria-label', 'Stop voice recording');
        micButton.title = 'Stop recording';
        voiceRecorder.addEventListener('dataavailable', (event) => {
          if (event.data.size) voiceChunks.push(event.data);
        });
        voiceRecorder.addEventListener('error', (event) => {
          if (recorderToken !== voiceRecorderToken) return;
          console.error('Voice-note recording failed:', event.error);
          showMessageStatus(status, 'Voice note recording failed. Check microphone access and try again.', true);
          voiceStream?.getTracks().forEach((track) => track.stop());
          voiceStream = null;
          voiceRecorder = null;
          clearVoiceNote();
        }, { once: true });
        voiceRecorder.addEventListener('stop', () => {
          if (recorderToken !== voiceRecorderToken) return;
          publishVoiceRecording(false);
          voiceLocked = false;
          micButton.classList.remove('is-recording');
          micButton.setAttribute('aria-label', 'Record another voice note');
          micButton.title = 'Record another voice note';
          recordingWaveform.classList.remove('is-recording');
          recordingWaveform.hidden = true;
          voiceStream?.getTracks().forEach((track) => track.stop());
          voiceStream = null;
          const recordedType = voiceRecorder?.mimeType || mimeType || 'audio/webm';
          voiceBlob = new Blob(voiceChunks, { type: recordedType });
          const recordedContentType = (voiceBlob.type || 'audio/webm').split(';')[0].toLowerCase();
          voiceExtension = recordedContentType.includes('ogg')
            ? 'ogg'
            : recordedContentType.includes('mp4') ? 'mp4' : 'webm';
          voiceRecorder = null;
          voiceChunks = [];
          if (!voiceBlob.size) {
            clearVoiceNote();
            showMessageStatus(status, 'No audio was recorded. Please try again.', true);
            return;
          }
          voiceObjectUrl = URL.createObjectURL(voiceBlob);
          voicePreview.setSource(voiceObjectUrl);
          voicePreview.element.hidden = false;
          voiceStatus.textContent = 'Preview or delete before sending';
          discardVoiceButton.hidden = false;
          sendButton.disabled = false;
          setComposerAction();
        }, { once: true });
        voiceRecorder.start();
        publishVoiceRecording(true);
        if (!voicePointerDown) {
          voiceLocked = true;
          voiceStatus.textContent = 'Recording locked — tap the microphone to stop';
          micButton.classList.add('is-recording');
        }
      } catch (error) {
        console.error('Unable to access microphone:', error);
        voiceStream?.getTracks().forEach((track) => track.stop());
        voiceStream = null;
        voiceRecorder = null;
        voiceControls.hidden = true;
        input.hidden = false;
        showMessageStatus(
          status,
          error.name === 'NotAllowedError'
            ? 'Allow microphone access in your browser to record a voice note.'
            : 'The microphone could not be started. Check its permissions and try again.',
          true
        );
      }
    };
    micButton.addEventListener('pointerdown', (event) => {
      if (input.value.trim() || voiceBlob || messageAttachment || event.button !== 0) return;
      event.preventDefault();
      micButton.setPointerCapture?.(event.pointerId);
      voicePointerDown = true;
      voiceLocked = false;
      voicePointerStartX = event.clientX;
      voiceIgnoreClick = true;
      window.setTimeout(() => { voiceIgnoreClick = false; }, 500);
      startVoiceRecording();
    });
    micButton.addEventListener('pointermove', (event) => {
      if (!voicePointerDown || voiceLocked) return;
      if (voicePointerStartX - event.clientX >= 55) {
        voiceLocked = true;
        voiceStatus.textContent = 'Recording locked — tap the microphone to stop';
        micButton.classList.add('is-recording');
      }
    });
    micButton.addEventListener('pointerup', () => {
      if (!voicePointerDown) return;
      voicePointerDown = false;
      voiceIgnoreClick = true;
      window.setTimeout(() => { voiceIgnoreClick = false; }, 500);
      if (!voiceLocked) {
        if (voiceRecorder?.state === 'recording') stopVoiceRecording();
        else {
          voiceLocked = true;
          voiceStatus.textContent = 'Starting microphone… recording will continue until you tap the microphone';
        }
      }
    });
    micButton.addEventListener('pointercancel', () => {
      voicePointerDown = false;
      voiceLocked = false;
      clearVoiceNote();
    });
    micButton.addEventListener('click', (event) => {
      if (voiceIgnoreClick) {
        event.preventDefault();
        return;
      }
      if (voiceRecorder?.state === 'recording') {
        event.preventDefault();
        voiceLocked = false;
        micButton.classList.remove('is-recording');
        stopVoiceRecording();
      } else if (!voicePointerDown && !input.value.trim() && !voiceBlob && !messageAttachment) {
        event.preventDefault();
        voiceLocked = true;
        startVoiceRecording();
      }
    });
    discardVoiceButton.addEventListener('click', clearVoiceNote);
    setComposerAction();
    input.addEventListener('focus', setComposerAction);
    input.addEventListener('blur', setComposerAction);
    input.addEventListener('input', () => {
      setComposerAction();
      if (!input.value.trim()) {
        stopTyping();
        return;
      }
      if (!localTypingActive) publishTyping(true);
      window.clearTimeout(typingIdleTimer);
      typingIdleTimer = window.setTimeout(stopTyping, 1500);
    });
    form.append(mediaInput, attachmentPreview, input, voiceControls, mediaButton, micButton, sendButton);
    chat.append(header, status, thread, replyPreview, form);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const content = input.value.trim();
      if (!content && !voiceBlob && !messageAttachment) {
        input.focus();
        setComposerAction();
        return;
      }
      sendButton.disabled = true;
      stopTyping();
      showMessageStatus(status, '');
      try {
        const sendSoundContext = await prepareMessageSendSound();
        if (messageAttachment && activeGroup) {
          await sendGroupMediaMessage(
            activeGroup.id,
            content,
            messageAttachment.blob,
            messageAttachment.extension,
            messageAttachment.contentType
          );
        } else if (messageAttachment) {
          await sendDirectMediaMessage(
            profile.id,
            content,
            messageAttachment.blob,
            messageAttachment.extension,
            messageAttachment.contentType
          );
        } else if (voiceBlob && activeGroup) {
          await sendGroupVoiceMessage(activeGroup.id, voiceBlob, voiceExtension, replyToMessage?.id || null);
        } else if (voiceBlob) {
          await sendDirectVoiceMessage(profile.id, voiceBlob, voiceExtension, replyToMessage?.id || null);
        } else if (activeGroup) {
          await sendGroupMessage(activeGroup.id, content, replyToMessage?.id || null);
        } else {
          await sendDirectMessageReply(profile.id, content, replyToMessage?.id || null);
        }
        playMessageSendSound(sendSoundContext);
        input.value = '';
        clearMessageAttachment();
        clearVoiceNote();
        setComposerAction();
        clearReply();
        await loadThread(thread, status, threadId);
        await refreshConversations();
      } catch (error) {
        console.error('Unable to send direct message:', error);
        showMessageStatus(status, error.message || 'Your message could not be sent. Please try again.', true);
      } finally {
        setComposerAction();
      }
    });

    await loadThread(thread, status, threadId);
    const refreshOpenThread = () => {
      if (activeGroup ? activeGroup.id === group?.id : activePeerId === profile.id) {
        loadThread(thread, status, threadId);
        refreshConversations();
      }
    };
    const conversationTopic = activeGroup
      ? `group-messages-${activeGroup.id}`
      : `direct-messages-${[currentUserId, profile.id].sort().join('-')}`;
    currentMessageChannel = supabase
      .channel(conversationTopic, { config: { presence: { key: currentUserId } } })
      .on('presence', { event: 'sync' }, updateTypingIndicator)
      .on('presence', { event: 'join' }, updateTypingIndicator)
      .on('presence', { event: 'leave' }, updateTypingIndicator);
    if (activeGroup) {
      currentMessageChannel
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'group_messages',
          filter: `group_id=eq.${activeGroup.id}`
        }, refreshOpenThread)
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'group_messages'
        }, refreshOpenThread)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'group_message_reactions'
        }, refreshOpenThread);
    } else {
      currentMessageChannel
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${currentUserId}`
        }, refreshOpenThread)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'direct_messages',
          filter: `recipient_id=eq.${currentUserId}`
        }, refreshOpenThread)
        .on('postgres_changes', {
          event: 'DELETE',
          schema: 'public',
          table: 'direct_messages'
        }, refreshOpenThread)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'direct_message_reactions',
          filter: `user_id=eq.${profile.id}`
        }, refreshOpenThread);
    }
    currentMessageChannel.subscribe(async (subscriptionStatus) => {
      if (subscriptionStatus === 'SUBSCRIBED') {
        threadPresenceReady = true;
        await publishTyping(localTypingActive);
        updateTypingIndicator();
        refreshOpenThread();
      } else if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
        threadPresenceReady = false;
        console.warn('Live message updates and typing indicators are unavailable.');
        showMessageStatus(status, 'Live chat updates are unavailable. Check your connection and reopen this chat.', true);
      }
    });
  }

  function openGroupConversation(group) {
    return openConversation({
      id: group.id,
      username: group.name,
      avatar_url: group.avatar_url || ''
    }, group);
  }

  sectionView.addEventListener('messages-add-friend', (event) => {
    friendFinder.hidden = false;
    messagesSearchButton?.setAttribute('aria-controls', friendFinder.id);
    messagesSearchButton?.setAttribute('aria-expanded', 'true');
    searchGamers();
    if (event.detail?.focusSearch) searchInput.focus();
  });
  sectionView.addEventListener('messages-refresh-conversations', refreshConversations);
  sectionView.addEventListener('messages-create-group', showCreateGroupDialog);
  closeActiveFriendFinder = () => {
    friendFinder.hidden = true;
    messagesSearchButton?.setAttribute('aria-expanded', 'false');
    friendSearchRequestId += 1;
  };
  closeFriendFinder.addEventListener('click', () => {
    friendFinder.hidden = true;
    messagesSearchButton?.setAttribute('aria-expanded', 'false');
    messagesSearchButton?.focus();
  });
  friendFinder.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      friendFinder.hidden = true;
      messagesSearchButton?.setAttribute('aria-expanded', 'false');
      messagesSearchButton?.focus();
    }
  });
  friendFinder.addEventListener('click', (event) => {
    if (event.target === friendFinder) {
      friendFinder.hidden = true;
      messagesSearchButton?.setAttribute('aria-expanded', 'false');
    }
  });

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    searchGamers();
  });
  searchInput.addEventListener('input', () => {
    searchGamers();
  });
  refreshActiveFriendFinder = () => {
    if (!friendFinder.hidden) searchGamers();
  };
  await refreshConversations();
  if (initialGamerId && thisViewId === messageViewId) {
    try {
      await openConversation(await getMessageProfile(initialGamerId));
    } catch (error) {
      console.error('Unable to open conversation from notification:', error);
      showMessageStatus(conversationsStatus, 'This conversation could not be opened.', true);
    }
  }
}

function setActiveMenuItem(activeItem) {
  MENU_ITEMS.forEach((item) => {
    item.classList.remove('active');
    item.removeAttribute('aria-current');
  });

  activeItem?.classList.add('active');
  activeItem?.setAttribute('aria-current', 'page');
}

function setActiveTab(activeTab, inactiveTab) {
  if (inactiveTab) {
    inactiveTab.classList.remove('tab-active');
    inactiveTab.classList.add('tab-inactive');
    inactiveTab.style.backgroundColor = 'transparent';
    inactiveTab.style.borderColor = 'transparent';
    inactiveTab.style.color = '#b7b9ae';
  }

  if (activeTab) {
    activeTab.classList.remove('tab-inactive');
    activeTab.classList.add('tab-active');
    activeTab.style.backgroundColor = 'navy';
    activeTab.style.borderColor = 'navy';
    activeTab.style.color = 'white';
  }
}

async function showGamerProfile(gamerId) {
  const startingViewId = messageViewId;
  let profileViewId = null;
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (messageViewId !== startingViewId) return;
    if (userData.user?.id === gamerId) {
      const profile = await getMessageProfile(gamerId);
      if (messageViewId !== startingViewId) return;
      showSectionView(profile.username || FULLNAME?.textContent.trim() || 'Gamer', '', {
        isProfile: true,
        profile
      });
      return;
    }
    const profile = await getMessageProfile(gamerId);
    if (messageViewId !== startingViewId) return;
    showSectionView(profile.username || 'Gamer', '', {
      isProfile: true,
      isOwnProfile: false,
      profile
    });
    if (!sectionView) return;
    profileViewId = messageViewId;
    sectionView.dataset.profileId = gamerId;

    const profileActions = document.createElement('div');
    profileActions.className = 'profile-friend-actions';
    const relationshipButton = document.createElement('button');
    relationshipButton.type = 'button';
    relationshipButton.className = 'profile-connect-button';
    relationshipButton.disabled = true;
    relationshipButton.textContent = 'Checking…';
    const relationshipStatus = document.createElement('p');
    relationshipStatus.className = 'profile-connect-status';
    relationshipStatus.setAttribute('role', 'status');
    relationshipStatus.hidden = true;
    profileActions.append(relationshipButton, relationshipStatus);
    sectionView.appendChild(profileActions);

    let friendship;
    try {
      friendship = await getFriendshipStatus(gamerId);
    } catch (error) {
      console.error('Unable to load profile friendship status:', error);
      relationshipButton.disabled = false;
      relationshipButton.textContent = 'Retry';
      relationshipStatus.textContent = 'Friend status could not be checked. Try again.';
      relationshipStatus.hidden = false;
      relationshipButton.onclick = async () => {
        relationshipButton.disabled = true;
        try {
          friendship = await getFriendshipStatus(gamerId);
          relationshipStatus.hidden = true;
          updateRelationshipButton();
        } catch (requestError) {
          console.error('Unable to retry profile friendship status:', requestError);
          relationshipStatus.textContent = requestError.message || 'Friend status could not be checked.';
          relationshipStatus.hidden = false;
          relationshipButton.disabled = false;
        }
      };
    }

    const updateRelationshipButton = () => {
      if (!friendship || sectionView?.dataset.profileId !== gamerId) return;
      relationshipButton.disabled = false;
      relationshipButton.classList.toggle('is-message', friendship.status === 'friends');
      if (friendship.status === 'friends') {
        relationshipButton.textContent = 'Message';
        relationshipButton.onclick = () => {
          setActiveMenuItem(MESSAGES_MENU_ITEM);
          showMessages(gamerId).catch((error) => {
            console.error('Unable to open direct message from profile:', error);
            relationshipStatus.textContent = error.message || 'The conversation could not be opened.';
            relationshipStatus.hidden = false;
          });
        };
      } else if (friendship.status === 'request_sent') {
        relationshipButton.textContent = 'Request sent';
        relationshipButton.disabled = true;
        relationshipButton.onclick = null;
      } else if (friendship.status === 'request_received') {
        relationshipButton.textContent = 'Accept request';
        relationshipButton.onclick = async () => {
          relationshipButton.disabled = true;
          try {
            await respondToFriendRequest(friendship.requestId, true);
            friendship = { status: 'friends', requestId: friendship.requestId };
            updateRelationshipButton();
          } catch (error) {
            console.error('Unable to accept friend request from profile:', error);
            relationshipStatus.textContent = error.message || 'The friend request could not be accepted.';
            relationshipStatus.hidden = false;
            relationshipButton.disabled = false;
          }
        };
      } else {
        relationshipButton.textContent = 'Add friend';
        relationshipButton.onclick = async () => {
          relationshipButton.disabled = true;
          relationshipStatus.hidden = true;
          try {
            await sendFriendRequest(gamerId);
            friendship = await getFriendshipStatus(gamerId);
            updateRelationshipButton();
          } catch (error) {
            console.error('Unable to send friend request from profile:', error);
            relationshipStatus.textContent = error.message || 'The friend request could not be sent.';
            relationshipStatus.hidden = false;
            relationshipButton.disabled = false;
          }
        };
      }
    };
    if (messageViewId !== profileViewId || sectionView?.dataset.profileId !== gamerId) return;
    if (friendship) updateRelationshipButton();
    activeProfileFriendChannel = supabase
      .channel(`profile-friendship-${gamerId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
        filter: `requester_id=eq.${userData.user.id}`
      }, refreshFriendship)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'friend_requests',
        filter: `recipient_id=eq.${userData.user.id}`
      }, refreshFriendship)
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Friend request status will not update live on this profile.');
        }
      });

    async function refreshFriendship() {
      try {
        const currentFriendship = await getFriendshipStatus(gamerId);
        if (messageViewId !== profileViewId || sectionView?.dataset.profileId !== gamerId) return;
        friendship = currentFriendship;
        updateRelationshipButton();
      } catch (error) {
        console.error('Unable to refresh profile friendship status:', error);
      }
    }

    const postsHeading = document.createElement('h3');
    postsHeading.className = 'gamer-profile-posts-heading';
    postsHeading.textContent = 'Recent posts';
    const postsStatus = document.createElement('p');
    postsStatus.className = 'gamer-profile-posts-status';
    postsStatus.setAttribute('role', 'status');
    postsStatus.textContent = 'Loading posts...';
    const profilePosts = document.createElement('div');
    profilePosts.className = 'gamer-profile-posts';
    sectionView.append(postsHeading, postsStatus, profilePosts);

    const posts = await getPosts();
    if (sectionView?.dataset.profileId !== gamerId) return;
    const gamerPosts = posts.filter((post) => post.uid === gamerId);
    postsStatus.textContent = gamerPosts.length ? '' : 'No posts yet.';
    gamerPosts.forEach((post) => profilePosts.appendChild(createPostCard(post)));
  } catch (error) {
    console.error('Unable to open gamer profile:', error);
    if (profileViewId !== null) {
      if (messageViewId === profileViewId && sectionView?.dataset.profileId === gamerId) {
        const postsStatus = sectionView.querySelector('.gamer-profile-posts-status');
        if (postsStatus) postsStatus.textContent = 'This gamer’s posts could not be loaded. Please try again.';
      }
      return;
    }
    if (messageViewId !== startingViewId) return;
    showSectionView('Profile', error.message || 'This gamer profile could not be loaded. Please try again.');
  }
}

function createPostCard(post) {
  const postCard = document.createElement('article');
  const postHeader = document.createElement('header');
  const authorAvatar = document.createElement('button');
  const authorImage = document.createElement('img');
  const authorInitial = document.createElement('span');
  const authorName = document.createElement('button');
  const followButton = document.createElement('button');
  const deleteButton = document.createElement('button');
  const postText = document.createElement('p');
  let postMedia = null;
  const likeRow = document.createElement('div');
  const likeButton = document.createElement('button');
  const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const heartPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const likesCount = document.createElement('p');
  const commentButton = document.createElement('button');
  const commentIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const commentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const commentCount = document.createElement('span');
  const commentsPanel = document.createElement('div');
  const commentsList = document.createElement('div');
  const commentsStatus = document.createElement('p');
  const commentForm = document.createElement('form');
  const commentInput = document.createElement('textarea');
  const commentSubmit = document.createElement('button');
  const commentReplyContext = document.createElement('div');
  const commentReplyLabel = document.createElement('span');
  const cancelCommentReply = document.createElement('button');
  const commentsOverlay = document.createElement('div');
  const commentsSheetHeader = document.createElement('header');
  const commentsSheetHandle = document.createElement('span');
  const commentsSheetTitle = document.createElement('h2');
  const closeCommentsButton = document.createElement('button');
  let liked = post.likedByCurrentUser || false;
  let replyTarget = null;
  let commentsViewportResize = null;
  const commentReplyLists = new Map();

  postCard.classList.add('div3');
  postCard.id = `post-${post.id}`;
  postHeader.classList.add('post-author-header');
  authorAvatar.classList.add('post-author-avatar');
  authorAvatar.type = 'button';
  authorAvatar.setAttribute('aria-label', `View ${post.username || 'Gamer'}'s profile`);
  authorImage.classList.add('post-author-image');
  authorImage.alt = '';
  authorInitial.classList.add('post-author-initial');
  authorInitial.textContent = (post.username || 'G').trim().charAt(0).toUpperCase() || 'G';
  if (post.avatarURL) {
    authorImage.src = post.avatarURL;
    authorImage.hidden = false;
    authorInitial.hidden = true;
  } else {
    authorImage.hidden = true;
  }
  authorImage.addEventListener('error', () => {
    authorImage.hidden = true;
    authorInitial.hidden = false;
  });
  authorName.classList.add('post-author-name');
  authorName.type = 'button';
  authorName.setAttribute('aria-label', `View ${post.username || 'Gamer'}'s profile`);
  authorName.textContent = post.username || 'Gamer';
  authorAvatar.append(authorImage, authorInitial);
  authorAvatar.addEventListener('click', () => showGamerProfile(post.uid));
  authorName.addEventListener('click', () => showGamerProfile(post.uid));
  followButton.type = 'button';
  followButton.classList.add('post-follow-button');
  followButton.dataset.userId = post.uid;
  followButton.textContent = post.isFollowingAuthor ? 'Following' : 'Follow';
  followButton.setAttribute('aria-pressed', String(Boolean(post.isFollowingAuthor)));
  followButton.setAttribute(
    'aria-label',
    `${post.isFollowingAuthor ? 'Unfollow' : 'Follow'} ${post.username || 'Gamer'}`
  );
  followButton.title = `${post.isFollowingAuthor ? 'Unfollow' : 'Follow'} ${post.username || 'Gamer'}`;
  followButton.hidden = post.isOwnPost;
  deleteButton.type = 'button';
  deleteButton.classList.add('post-delete-button');
  deleteButton.setAttribute('aria-label', 'Delete post');
  deleteButton.title = 'Delete post';
  deleteButton.hidden = !post.isOwnPost;
  deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
    <path stroke-linecap="round" stroke-linejoin="round" d="m6 6 12 12M18 6 6 18" />
  </svg>`;
  postHeader.append(authorAvatar, authorName, followButton, deleteButton);

  deleteButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (deleteButton.disabled) return;
    if (!window.confirm('Delete this post permanently? Its comments and likes will also be removed.')) return;

    deleteButton.disabled = true;
    deleteButton.setAttribute('aria-busy', 'true');
    try {
      const result = await deletePost(post.id);
      postCard.remove();
      if (result.mediaCleanupFailed) {
        alert('The post and its comments and likes were deleted, but its uploaded media could not be removed. Please contact support to clean up the media file.');
      }
    } catch (error) {
      console.error('Unable to delete post:', error);
      alert(error.message || 'The post could not be deleted. Please try again.');
      deleteButton.disabled = false;
      deleteButton.removeAttribute('aria-busy');
    }
  });

  followButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (followButton.disabled) return;
    const originalLabel = followButton.textContent;
    followButton.disabled = true;
    followButton.textContent = 'Please wait…';
    try {
      const isFollowing = await toggleFollow(post.uid);
      document.querySelectorAll('.post-follow-button').forEach((button) => {
        if (button.dataset.userId !== post.uid) return;
        button.textContent = isFollowing ? 'Following' : 'Follow';
        button.setAttribute('aria-pressed', String(isFollowing));
        const author = button.closest('.post-author-header')?.querySelector('.post-author-name')?.textContent || 'Gamer';
        button.setAttribute('aria-label', `${isFollowing ? 'Unfollow' : 'Follow'} ${author}`);
        button.title = `${isFollowing ? 'Unfollow' : 'Follow'} ${author}`;
        button.classList.toggle('is-following', isFollowing);
      });
    } catch (error) {
      console.error('Unable to update follow status:', error);
      alert(error.message || 'Follow status could not be updated. Please try again.');
      followButton.textContent = originalLabel;
    } finally {
      followButton.disabled = false;
    }
  });

  followButton.classList.toggle('is-following', Boolean(post.isFollowingAuthor));
  postText.classList.add('header22');
  postText.textContent = post.content || '';
  postText.hidden = !post.content;
  likeRow.classList.add('like-row');

  if (post.mediaURL) {
    postMedia = document.createElement(post.mediaType === 'video' ? 'video' : 'img');
    postMedia.classList.add('post-media');
    postMedia.src = post.mediaURL;
    if (post.mediaType === 'video') {
      postMedia.controls = true;
      postMedia.preload = 'metadata';
    } else {
      postMedia.alt = 'Post image';
      postMedia.loading = 'lazy';
    }
  }

  heart.setAttribute('viewBox', '0 0 24 24');
  heart.setAttribute('fill', liked ? 'red' : 'none');
  heart.setAttribute('stroke-width', '1.5');
  heart.setAttribute('stroke', 'currentColor');
  heart.classList.add('header3');
  heart.setAttribute('aria-hidden', 'true');
  heartPath.setAttribute(
    'd',
    'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z'
  );
  heart.appendChild(heartPath);
  likeButton.type = 'button';
  likeButton.classList.add('post-like-button');
  likeButton.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
  likeButton.setAttribute('aria-pressed', String(liked));
  if (liked) likeButton.classList.add('is-liked');
  likeButton.appendChild(heart);

  likesCount.textContent = String(post.likesCount || 0);
  let commentsCount = Number(post.commentsCount) || 0;
  commentButton.type = 'button';
  commentButton.classList.add('post-comment-toggle');
  commentButton.setAttribute('aria-label', `Show ${commentsCount} comments`);
  commentButton.setAttribute('aria-expanded', 'false');
  commentButton.title = `${commentsCount} comments`;
  commentIcon.setAttribute('viewBox', '0 0 24 24');
  commentIcon.setAttribute('fill', 'none');
  commentIcon.setAttribute('stroke-width', '1.5');
  commentIcon.setAttribute('stroke', 'currentColor');
  commentIcon.classList.add('header3');
  commentIcon.setAttribute('aria-hidden', 'true');
  commentPath.setAttribute('stroke-linecap', 'round');
  commentPath.setAttribute('stroke-linejoin', 'round');
  commentPath.setAttribute(
    'd',
    'M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z'
  );
  commentIcon.appendChild(commentPath);
  commentCount.classList.add('post-comment-count');
  commentCount.textContent = String(commentsCount);
  commentButton.append(commentIcon, commentCount);
  likeRow.append(likeButton, likesCount, commentButton);

  commentsPanel.classList.add('comments-panel');
  commentsPanel.hidden = true;
  commentsOverlay.className = 'comments-sheet-overlay';
  commentsOverlay.hidden = true;
  commentsOverlay.setAttribute('aria-hidden', 'true');
  commentsOverlay.setAttribute('role', 'presentation');
  commentsPanel.setAttribute('role', 'dialog');
  commentsPanel.setAttribute('aria-modal', 'true');
  commentsPanel.setAttribute('aria-label', 'Post comments');
  commentsSheetHeader.className = 'comments-sheet-header';
  commentsSheetHandle.className = 'comments-sheet-handle';
  commentsSheetHandle.setAttribute('aria-hidden', 'true');
  commentsSheetTitle.className = 'comments-sheet-title';
  commentsSheetTitle.textContent = 'Comments';
  closeCommentsButton.type = 'button';
  closeCommentsButton.className = 'comments-sheet-close';
  closeCommentsButton.setAttribute('aria-label', 'Close comments');
  closeCommentsButton.textContent = '×';
  commentsSheetHeader.append(commentsSheetHandle, commentsSheetTitle, closeCommentsButton);
  commentsList.classList.add('comments-list');
  commentsStatus.classList.add('comments-status');
  commentsStatus.hidden = true;
  commentsInputSetup();
  commentsPanel.append(
    commentsSheetHeader,
    commentsStatus,
    commentsList,
    commentReplyContext,
    commentForm
  );
  commentsOverlay.appendChild(commentsPanel);

  function appendComment(comment) {
    const item = document.createElement('article');
    item.classList.add('post-comment');
    const avatar = document.createElement('button');
    const avatarImage = document.createElement('img');
    const avatarInitial = document.createElement('span');
    const commentBody = document.createElement('div');
    const author = document.createElement('button');
    author.type = 'button';
    author.className = 'post-comment-author';
    author.setAttribute('aria-label', `View ${comment.username || 'Gamer'}'s profile`);
    author.textContent = comment.username || 'Gamer';
    author.addEventListener('click', () => {
      closeCommentsSheet();
      showGamerProfile(comment.user_id);
    });
    const text = document.createElement('p');
    text.textContent = comment.content;
    avatar.classList.add('comment-avatar');
    avatar.type = 'button';
    avatar.setAttribute('aria-label', `View ${comment.username || 'Gamer'}'s profile`);
    avatarImage.classList.add('comment-avatar-image');
    avatarImage.alt = '';
    avatarInitial.classList.add('comment-avatar-initial');
    avatarInitial.textContent = (comment.username || 'G').trim().charAt(0).toUpperCase() || 'G';
    avatarInitial.hidden = Boolean(comment.avatarURL);
    avatarImage.hidden = !comment.avatarURL;
    if (comment.avatarURL) avatarImage.src = comment.avatarURL;
    avatarImage.addEventListener('error', () => {
      avatarImage.hidden = true;
      avatarInitial.hidden = false;
    });
    avatar.append(avatarImage, avatarInitial);
    avatar.addEventListener('click', () => {
      closeCommentsSheet();
      showGamerProfile(comment.user_id);
    });
    commentBody.classList.add('post-comment-body');
    item.dataset.commentId = comment.id;
    const replyButton = document.createElement('button');
    replyButton.type = 'button';
    replyButton.className = 'post-comment-reply';
    replyButton.textContent = 'Reply';
    replyButton.hidden = Boolean(comment.parent_comment_id);
    replyButton.addEventListener('click', () => {
      if (!comment.parent_comment_id) {
        replyTarget = comment;
        commentReplyLabel.textContent = `Replying to ${comment.username || 'Gamer'}`;
        commentReplyContext.hidden = false;
        commentInput.placeholder = `Reply to ${comment.username || 'Gamer'}…`;
        commentInput.focus();
      }
    });
    commentBody.append(author, text, replyButton);
    const replies = document.createElement('div');
    replies.className = 'post-comment-replies';
    commentReplyLists.set(comment.id, replies);
    item.append(avatar, commentBody, replies);
    if (comment.parent_comment_id) {
      const parentReplies = commentReplyLists.get(comment.parent_comment_id);
      if (parentReplies) {
        item.classList.add('is-reply');
        parentReplies.appendChild(item);
        return;
      }
    }
    commentsList.appendChild(item);
  }

  function updateCommentCount(count) {
    commentsCount = count;
    commentCount.textContent = String(commentsCount);
    commentButton.setAttribute(
      'aria-label',
      `${commentButton.getAttribute('aria-expanded') === 'true' ? 'Hide' : 'Show'} ${commentsCount} comments`
    );
    commentButton.title = `${commentsCount} comments`;
  }

  function commentsInputSetup() {
    commentForm.classList.add('comment-form');
    commentInput.maxLength = 2000;
    commentInput.rows = 1;
    commentInput.placeholder = 'Write a comment…';
    commentInput.setAttribute('aria-label', 'Write a comment');
    commentSubmit.type = 'submit';
    commentSubmit.classList.add('comment-send-button');
    commentSubmit.setAttribute('aria-label', 'Send comment');
    commentSubmit.title = 'Send comment';
    commentSubmit.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
</svg>`;
    commentReplyContext.className = 'comment-reply-context';
    commentReplyContext.hidden = true;
    commentReplyLabel.className = 'comment-reply-label';
    cancelCommentReply.type = 'button';
    cancelCommentReply.className = 'comment-reply-cancel';
    cancelCommentReply.setAttribute('aria-label', 'Cancel reply');
    cancelCommentReply.textContent = '×';
    cancelCommentReply.addEventListener('click', clearCommentReply);
    commentReplyContext.append(commentReplyLabel, cancelCommentReply);
    commentForm.append(commentInput, commentSubmit);
  }

  function clearCommentReply() {
    replyTarget = null;
    commentReplyContext.hidden = true;
    commentReplyLabel.textContent = '';
    commentInput.placeholder = 'Write a comment…';
  }

  async function loadComments() {
    commentsStatus.hidden = false;
    commentsStatus.textContent = 'Loading comments…';
    commentsStatus.setAttribute('role', 'status');
    try {
      const comments = await getPostComments(post.id);
      commentsList.replaceChildren();
      commentReplyLists.clear();
      comments.forEach(appendComment);
      updateCommentCount(comments.length);
      commentsStatus.hidden = comments.length > 0;
      commentsStatus.textContent = comments.length ? '' : 'No comments yet. Start the conversation.';
    } catch (error) {
      console.error('Unable to load comments:', error);
      commentsStatus.textContent = error.message || 'Comments could not be loaded. Close and reopen comments to retry.';
      commentsStatus.setAttribute('role', 'alert');
    }
  }

  commentButton.addEventListener('click', () => {
    const isOpening = commentsPanel.hidden;
    commentButton.setAttribute('aria-expanded', String(isOpening));
    updateCommentCount(commentsCount);
    if (isOpening) {
      commentsPanel.hidden = false;
      commentsOverlay.hidden = false;
      commentsOverlay.setAttribute('aria-hidden', 'false');
      commentsOverlay.setAttribute('role', 'presentation');
      commentsOverlay.classList.remove('is-closing');
      document.body.appendChild(commentsOverlay);
      const syncCommentsViewport = () => {
        const viewport = window.visualViewport;
        if (!viewport) return;
        commentsOverlay.style.top = `${viewport.offsetTop}px`;
        commentsOverlay.style.height = `${viewport.height}px`;
        commentsOverlay.style.bottom = 'auto';
      };
      commentsViewportResize = syncCommentsViewport;
      syncCommentsViewport();
      window.visualViewport?.addEventListener('resize', commentsViewportResize);
      window.visualViewport?.addEventListener('scroll', commentsViewportResize);
      requestAnimationFrame(() => commentsOverlay.classList.add('is-open'));
      loadComments();
    } else {
      closeCommentsSheet();
    }
  });

  function closeCommentsSheet() {
    if (commentsOverlay.hidden) return;
    if (commentsViewportResize) {
      window.visualViewport?.removeEventListener('resize', commentsViewportResize);
      window.visualViewport?.removeEventListener('scroll', commentsViewportResize);
      commentsViewportResize = null;
      commentsOverlay.style.top = '';
      commentsOverlay.style.height = '';
      commentsOverlay.style.bottom = '';
    }
    commentsOverlay.classList.remove('is-open');
    commentsOverlay.classList.add('is-closing');
    commentButton.setAttribute('aria-expanded', 'false');
    window.setTimeout(() => {
      if (commentsOverlay.classList.contains('is-open')) return;
      commentsOverlay.remove();
      commentsOverlay.hidden = true;
      commentsOverlay.setAttribute('aria-hidden', 'true');
      commentsPanel.hidden = true;
      commentButton.focus();
    }, 240);
  }

  closeCommentsButton.addEventListener('click', closeCommentsSheet);
  commentsOverlay.addEventListener('click', (event) => {
    if (event.target === commentsOverlay) closeCommentsSheet();
  });
  commentsOverlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeCommentsSheet();
  });
  let commentsSwipeStart = null;
  commentsSheetHeader.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.comments-sheet-close')) return;
    commentsSwipeStart = event.clientY;
    commentsSheetHeader.setPointerCapture(event.pointerId);
  });
  commentsSheetHeader.addEventListener('pointerup', (event) => {
    if (commentsSwipeStart !== null && event.clientY - commentsSwipeStart > 60) {
      closeCommentsSheet();
    }
    commentsSwipeStart = null;
  });
  commentsSheetHeader.addEventListener('pointercancel', () => {
    commentsSwipeStart = null;
  });

  commentForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const content = commentInput.value.trim();
    if (!content) return;
    commentSubmit.disabled = true;
    commentsStatus.hidden = false;
    commentsStatus.textContent = replyTarget ? 'Sending reply…' : 'Sending comment…';
    try {
      const comment = await createPostComment(post.id, content, replyTarget?.id || null);
      appendComment(comment);
      updateCommentCount(commentsCount + 1);
      commentInput.value = '';
      clearCommentReply();
      commentsStatus.hidden = true;
    } catch (error) {
      console.error('Unable to add comment:', error);
      commentsStatus.textContent = error.message || 'Your comment could not be sent. Please try again.';
    } finally {
      commentSubmit.disabled = false;
    }
  });

  postCard.append(postHeader);
  if (postMedia) postCard.appendChild(postMedia);
  postCard.append(postText, likeRow);

  const handleLike = async () => {
    if (likeButton.getAttribute('aria-busy') === 'true') return;
    likeButton.setAttribute('aria-busy', 'true');

    try {
      const result = await togglePostLike(post.id);
      liked = result.liked;
      likesCount.textContent = String(result.likesCount);
      heart.style.fill = liked ? 'currentColor' : 'none';
      likeButton.classList.toggle('is-liked', liked);
      likeButton.setAttribute('aria-label', liked ? 'Unlike post' : 'Like post');
      likeButton.setAttribute('aria-pressed', String(liked));
    } catch (error) {
      console.error('Unable to update post like:', error);
      alert('Your like could not be saved. Please try again.');
    } finally {
      likeButton.removeAttribute('aria-busy');
    }
  };

  likeButton.addEventListener('click', handleLike);

  return postCard;
}

async function showFeeds() {
  const requestId = ++feedLoadRequestId;
  isGameNewsView = false;
  setAppBarState('home');
  setActiveMenuItem(FEED_MENU_ITEM);
  setActiveTab(FEEDS_TAB, GAME_NEWS_TAB);

  if (!NEWS_CONTAINER) return;
  isFeedView = true;
  showNewsView();

  Array.from(NEWS_CONTAINER.children).forEach((child) => {
    if (child.id !== 'container1') child.style.display = 'none';
  });

  let emptyState = document.getElementById('feed-empty-state');
  if (!emptyState) {
    emptyState = document.createElement('div');
    emptyState.id = 'feed-empty-state';
    //add button icon
    emptyState.innerHTML = `<button type="button" id="add-button" aria-label="Create a post">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 6v12M6 12h12" />
      </svg>
    </button>`;
    emptyState.style.display = 'flex';
    emptyState.style.justifyContent = 'center';
    emptyState.style.padding = '24px';
    NEWS_CONTAINER.appendChild(emptyState);
    const ADD_Button = document.getElementById('add-button');
    ADD_Button.addEventListener('click', () => {
      const overlay = document.createElement('div');
      overlay.classList.add('post-modal-overlay');
      const composer = document.createElement('section');
      composer.classList.add('div2', 'post-composer');
      composer.setAttribute('aria-label', 'Create a post');

      const title = document.createElement('h2');
      title.classList.add('composer-title');
      title.textContent = 'Create post';

      const closeButton = document.createElement('button');
      closeButton.type = 'button';
      closeButton.classList.add('composer-close');
      closeButton.setAttribute('aria-label', 'Close post composer');
      closeButton.textContent = '×';

      const imageInput = document.createElement('input');
      imageInput.type = 'file';
      imageInput.accept = 'image/*';
      imageInput.hidden = true;
      const videoInput = document.createElement('input');
      videoInput.type = 'file';
      videoInput.accept = 'video/*';
      videoInput.hidden = true;

      const actionRow = document.createElement('div');
      actionRow.classList.add('composer-actions');
      const imageButton = document.createElement('button');
      imageButton.type = 'button';
      imageButton.classList.add('div2-option');
      imageButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
</svg><span>Image</span>`;

      const videoButton = document.createElement('button');
      videoButton.type = 'button';
      videoButton.classList.add('div2-option');
      videoButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z" />
</svg><span>Video</span>`;

      const textButton = document.createElement('button');
      textButton.type = 'button';
      textButton.classList.add('div2-option');
      textButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
</svg><span>Text</span>`;
      actionRow.append(imageButton, videoButton, textButton);

      const mediaPreview = document.createElement('div');
      mediaPreview.classList.add('composer-media-preview');
      mediaPreview.hidden = true;
      const selectedMediaName = document.createElement('span');
      const removeMediaButton = document.createElement('button');
      removeMediaButton.type = 'button';
      removeMediaButton.textContent = 'Remove';
      removeMediaButton.setAttribute('aria-label', 'Remove selected media');
      mediaPreview.append(selectedMediaName, removeMediaButton);

      const caption = document.createElement('textarea');
      caption.classList.add('text-box');
      caption.placeholder = 'Write a caption (optional)…';
      caption.setAttribute('aria-label', 'Post caption, optional');
      caption.maxLength = 2000;

      const postButton = document.createElement('button');
      postButton.type = 'button';
      postButton.classList.add('btn2');
      postButton.textContent = 'Post';
      postButton.disabled = true;

      composer.append(
        title,
        closeButton,
        actionRow,
        imageInput,
        videoInput,
        mediaPreview,
        caption,
        postButton
      );
      overlay.appendChild(composer);
      document.body.appendChild(overlay);

      let selectedFile = null;
      const updatePostButton = () => {
        postButton.disabled = !selectedFile && !caption.value.trim();
      };
      const closeComposer = () => {
        overlay.remove();
      };
      closeButton.addEventListener('click', closeComposer);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) closeComposer();
      });
      imageButton.addEventListener('click', () => imageInput.click());
      videoButton.addEventListener('click', () => videoInput.click());
      textButton.addEventListener('click', () => caption.focus());
      caption.addEventListener('input', updatePostButton);

      const handleMediaSelection = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('Choose a file smaller than 5 MB.');
          event.target.value = '';
          return;
        }
        selectedFile = file;
        selectedMediaName.textContent = file.name;
        mediaPreview.hidden = false;
        updatePostButton();
      };
      imageInput.addEventListener('change', handleMediaSelection);
      videoInput.addEventListener('change', handleMediaSelection);
      removeMediaButton.addEventListener('click', () => {
        selectedFile = null;
        imageInput.value = '';
        videoInput.value = '';
        selectedMediaName.textContent = '';
        mediaPreview.hidden = true;
        updatePostButton();
      });

      postButton.addEventListener('click', async () => {
        const postContent = caption.value.trim();
        if (!selectedFile && !postContent) return;

        const spinner = document.createElement('span');
        spinner.classList.add('post-spinner');
        spinner.setAttribute('aria-hidden', 'true');
        postButton.replaceChildren(spinner, document.createTextNode('Posting…'));
        postButton.disabled = true;
        postButton.setAttribute('aria-busy', 'true');
        closeButton.disabled = true;

        try {
          const post = await createPost(postContent, selectedFile);
          document.getElementById('feed-posts')?.prepend(createPostCard({
            id: post.id,
            uid: post.user_id,
            username: post.username,
            avatarURL: post.avatar_url || profilePhotoURL,
            isOwnPost: true,
            isFollowingAuthor: false,
            content: postContent,
            mediaURL: post.media_url,
            mediaType: post.media_type,
            likesCount: 0,
            commentsCount: 0,
            likedByCurrentUser: false
          }));
          closeComposer();
        } catch (error) {
          console.error('Unable to create post:', error);
          alert(error.message || 'Your post could not be saved. Please try again.');
          postButton.textContent = 'Post';
          postButton.disabled = false;
          postButton.removeAttribute('aria-busy');
          closeButton.disabled = false;
        }
      });
    });
    //add button icon
  }

  emptyState.style.display = 'flex';

  let feedPosts = document.getElementById('feed-posts');
  if (!feedPosts) {
    feedPosts = document.createElement('section');
    feedPosts.id = 'feed-posts';
    NEWS_CONTAINER.appendChild(feedPosts);
  }
  feedPosts.style.display = '';

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const posts = await getPosts();
    if (requestId !== feedLoadRequestId) return;
    const postCards = document.createDocumentFragment();
    posts.forEach((post) => {
      postCards.appendChild(createPostCard(post));
    });
    feedPosts.replaceChildren(postCards);
  } catch (error) {
    console.error('Unable to load feed posts:', error);
  }
}

function showGameNews() {
  isFeedView = false;
  isGameNewsView = true;
  feedLoadRequestId += 1;
  setAppBarState('home');
  setActiveMenuItem(GAME_NEWS_MENU_ITEM);
  setActiveTab(GAME_NEWS_TAB, FEEDS_TAB);

  if (!NEWS_CONTAINER) return;
  showNewsView();

  Array.from(NEWS_CONTAINER.children).forEach((child) => {
    child.style.display = '';
  });

  const feedPosts = document.getElementById('feed-posts');
  if (feedPosts) feedPosts.style.display = 'none';

  const emptyState = document.getElementById('feed-empty-state');
  emptyState?.remove();
}

const feedRefreshIndicator = document.getElementById('feed-refresh-indicator');
const feedRefreshLabel = document.getElementById('feed-refresh-label');
const feedRefreshThreshold = 72;
let feedTouchStart = null;

function setFeedRefreshIndicator(state, visible, label) {
  if (!feedRefreshIndicator || !feedRefreshLabel) return;
  feedRefreshIndicator.dataset.state = state;
  feedRefreshIndicator.dataset.visible = String(visible);
  feedRefreshIndicator.hidden = !visible;
  feedRefreshLabel.textContent = label;
}

function isFeedAtTop() {
  return window.scrollY <= 0
    && document.documentElement.scrollTop <= 0
    && (!MAIN_CONTAINER || MAIN_CONTAINER.scrollTop <= 0);
}

window.addEventListener('touchstart', (event) => {
  if (!isFeedView || isFeedRefreshInProgress || !window.matchMedia('(max-width: 680px)').matches) return;
  if (event.touches.length !== 1 || !isFeedAtTop()) return;

  const target = event.target;
  if (!(target instanceof Element) || !target.closest('#feed-posts, #feed-empty-state')) return;
  if (target.closest('button, a, input, textarea, select, video, audio, [contenteditable="true"], [role="button"]')) return;

  const touch = event.touches[0];
  feedTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  if (!feedTouchStart || !isFeedView || isFeedRefreshInProgress || event.touches.length !== 1) return;

  const touch = event.touches[0];
  const deltaY = touch.clientY - feedTouchStart.y;
  const deltaX = Math.abs(touch.clientX - feedTouchStart.x);
  if (deltaY <= 0 || deltaX > deltaY) {
    feedTouchStart = null;
    setFeedRefreshIndicator('pulling', false, 'Pull to refresh');
    return;
  }

  if (event.cancelable) event.preventDefault();
  const ready = deltaY >= feedRefreshThreshold;
  setFeedRefreshIndicator(
    ready ? 'ready' : 'pulling',
    true,
    ready ? 'Release to refresh' : 'Pull to refresh'
  );
}, { passive: false });

window.addEventListener('touchend', async (event) => {
  if (!feedTouchStart) return;
  const touch = event.changedTouches[0];
  const shouldRefresh = touch
    && touch.clientY - feedTouchStart.y >= feedRefreshThreshold
    && isFeedView
    && !isFeedRefreshInProgress;
  feedTouchStart = null;

  if (!shouldRefresh) {
    setFeedRefreshIndicator('pulling', false, 'Pull to refresh');
    return;
  }

  isFeedRefreshInProgress = true;
  setFeedRefreshIndicator('refreshing', true, 'Refreshing feed...');
  try {
    await showFeeds();
  } finally {
    isFeedRefreshInProgress = false;
    setFeedRefreshIndicator('pulling', false, 'Pull to refresh');
  }
}, { passive: true });

window.addEventListener('touchcancel', () => {
  feedTouchStart = null;
  setFeedRefreshIndicator('pulling', false, 'Pull to refresh');
}, { passive: true });

let gameNewsTouchStart = null;

function isGameNewsAtTop() {
  return window.scrollY <= 0
    && document.documentElement.scrollTop <= 0
    && (!MAIN_CONTAINER || MAIN_CONTAINER.scrollTop <= 0);
}

window.addEventListener('touchstart', (event) => {
  if (!isGameNewsView || isGameNewsRefreshInProgress || !window.matchMedia('(max-width: 680px)').matches) return;
  if (event.touches.length !== 1 || !isGameNewsAtTop()) return;

  const target = event.target;
  if (!(target instanceof Element) || !target.closest('#news-view')) return;
  if (target.closest('button, a, input, textarea, select, video, audio, [contenteditable="true"], [role="button"]')) return;

  const touch = event.touches[0];
  gameNewsTouchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  if (!gameNewsTouchStart || !isGameNewsView || isGameNewsRefreshInProgress || event.touches.length !== 1) return;

  const touch = event.touches[0];
  const deltaY = touch.clientY - gameNewsTouchStart.y;
  const deltaX = Math.abs(touch.clientX - gameNewsTouchStart.x);
  if (deltaY <= 0 || deltaX > deltaY) {
    gameNewsTouchStart = null;
    setFeedRefreshIndicator('pulling', false, 'Pull down to refresh news');
    return;
  }

  if (event.cancelable) event.preventDefault();
  const ready = deltaY >= feedRefreshThreshold;
  setFeedRefreshIndicator(
    ready ? 'ready' : 'pulling',
    true,
    ready ? 'Release to refresh news' : 'Pull down to refresh news'
  );
}, { passive: false });

window.addEventListener('touchend', async (event) => {
  if (!gameNewsTouchStart) return;
  const touch = event.changedTouches[0];
  const shouldRefresh = touch
    && touch.clientY - gameNewsTouchStart.y >= feedRefreshThreshold
    && isGameNewsView
    && !isGameNewsRefreshInProgress;
  gameNewsTouchStart = null;

  if (!shouldRefresh || !refreshGamingNews) {
    setFeedRefreshIndicator('pulling', false, 'Pull down to refresh news');
    return;
  }

  isGameNewsRefreshInProgress = true;
  setFeedRefreshIndicator('refreshing', true, 'Refreshing gaming news...');
  try {
    await refreshGamingNews();
  } finally {
    isGameNewsRefreshInProgress = false;
    setFeedRefreshIndicator('pulling', false, 'Pull down to refresh news');
  }
}, { passive: true });

window.addEventListener('touchcancel', () => {
  gameNewsTouchStart = null;
  setFeedRefreshIndicator('pulling', false, 'Pull down to refresh news');
}, { passive: true });

TEXT1?.addEventListener('click', showFeeds);
TEXT?.addEventListener('click', showGameNews);
FEED_MENU_ITEM?.addEventListener('click', showFeeds);
GAME_NEWS_MENU_ITEM?.addEventListener('click', showGameNews);

const MESSAGES_MENU_ITEM = Array.from(MENU_ITEMS).find(
  (item) => item.querySelector('.menu-label')?.textContent.trim() === 'Messages'
);
const PROFILE_MENU_ITEM = Array.from(MENU_ITEMS).find(
  (item) => item.querySelector('.menu-label')?.textContent.trim() === 'Profile'
);
const SETTINGS_MENU_ITEM = Array.from(MENU_ITEMS).find(
  (item) => item.querySelector('.menu-label')?.textContent.trim() === 'Settings'
);

MESSAGES_MENU_ITEM?.addEventListener('click', () => {
  setActiveMenuItem(MESSAGES_MENU_ITEM);
  showMessages().catch((error) => {
    console.error('Unable to open messages:', error);
    if (MESSAGES_MENU_ITEM?.getAttribute('aria-current') !== 'page') return;
    showSectionView('Messages', error.message || 'Messages could not be opened. Please try again.');
  });
});

async function openMessageFromNotification(senderId) {
  if (!senderId) return;
  setActiveMenuItem(MESSAGES_MENU_ITEM);
  await showMessages(senderId);
}

navigator.serviceWorker?.addEventListener('message', (event) => {
  if (event.data?.type === 'OPEN_DIRECT_MESSAGE' && event.data.senderId) {
    openMessageFromNotification(event.data.senderId).catch((error) => {
      console.error('Unable to open the conversation from a phone notification:', error);
      showSectionView('Messages', error.message || 'This conversation could not be opened.');
    });
  }
});

const notificationChatId = new URLSearchParams(window.location.search).get('chat');
if (notificationChatId) {
  history.replaceState(null, '', `${window.location.pathname}${window.location.hash}`);
  openMessageFromNotification(notificationChatId).catch((error) => {
    console.error('Unable to open the conversation from a phone notification:', error);
    showSectionView('Messages', error.message || 'This conversation could not be opened.');
  });
}
PROFILE_MENU_ITEM?.addEventListener('click', () => {
  setActiveMenuItem(PROFILE_MENU_ITEM);
  setAppBarState('profile', 'Profile');
  getMessageProfileForCurrentUser().then((profile) => {
    if (PROFILE_MENU_ITEM?.getAttribute('aria-current') !== 'page') return;
    showSectionView(profile.username || FULLNAME?.textContent.trim() || 'Gamer', '', {
      headingClass: 'profile-name',
      isProfile: true,
      profile
    });
  }).catch((error) => {
    console.error('Unable to load your profile status:', error);
    if (PROFILE_MENU_ITEM?.getAttribute('aria-current') !== 'page') return;
    showSectionView(FULLNAME?.textContent.trim() || 'Gamer', '', {
      headingClass: 'profile-name',
      isProfile: true
    });
  });
});

async function getMessageProfileForCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Sign in to view your profile');
  return getMessageProfile(data.user.id);
}

SETTINGS_MENU_ITEM?.addEventListener('click', () => {
  setActiveMenuItem(SETTINGS_MENU_ITEM);
  showSettingsView();
});

messagesDeleteButton?.addEventListener('click', () => {
  deleteSelectedConversation?.();
});
messagesSearchButton?.addEventListener('click', () => {
  clearCurrentConversationSelection?.();
  if (messagesSearchButton.getAttribute('aria-expanded') === 'true') {
    closeActiveFriendFinder?.();
    return;
  }
  sectionView?.dispatchEvent(new CustomEvent('messages-add-friend', {
    detail: { focusSearch: true }
  }));
});
messagesMoreButton?.addEventListener('click', () => {
  clearCurrentConversationSelection?.();
  const isOpening = messagesMoreMenu.hidden;
  messagesMoreMenu.hidden = !isOpening;
  messagesMoreButton.setAttribute('aria-expanded', String(isOpening));
  if (isOpening && messagesMenuStatus) {
    messagesMenuStatus.hidden = true;
    messagesMenuStatus.textContent = '';
  }
});
messagesMoreMenu?.addEventListener('click', async (event) => {
  const action = event.target.closest('button');
  if (!action) return;
  if (action !== markMessagesReadButton) {
    messagesMoreMenu.hidden = true;
    messagesMoreButton?.setAttribute('aria-expanded', 'false');
  }
  if (action === markMessagesReadButton) {
    action.disabled = true;
    try {
      await markAllDirectMessagesRead();
      sectionView?.dispatchEvent(new Event('messages-refresh-conversations'));
      if (messagesMenuStatus) {
        messagesMenuStatus.textContent = 'All messages marked as read.';
        messagesMenuStatus.hidden = false;
      }
    } catch (error) {
      console.error('Unable to mark messages as read:', error);
      if (messagesMenuStatus) {
        messagesMenuStatus.textContent = error.message || 'Messages could not be marked as read. Please try again.';
        messagesMenuStatus.hidden = false;
      }
    } finally {
      action.disabled = false;
    }
  } else if (action === createGroupChatButton) {
    sectionView?.dispatchEvent(new Event('messages-create-group'));
  } else if (action === openChatSettingsButton) {
    setActiveMenuItem(SETTINGS_MENU_ITEM);
    showSettingsView();
  }
});
document.addEventListener('pointerdown', (event) => {
  if (!event.target.closest('.messages-more-wrap')) {
    if (messagesMoreMenu) messagesMoreMenu.hidden = true;
    messagesMoreButton?.setAttribute('aria-expanded', 'false');
  }
});
