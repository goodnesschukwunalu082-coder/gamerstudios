import { supabase } from './supabase-client.js';

if ('serviceWorker' in navigator && window.location.protocol !== 'file:') {
  navigator.serviceWorker.register('./service-worker.js').catch((error) => {
    console.error('Unable to register the app service worker:', error);
  });
}

const SIGNUP_FORM = document.getElementById('signup-form');
const LOGOUT = document.querySelector('.lines.logout-line');
const LOGIN_FORM = document.getElementById('login-form');
const SIGNUP_EMAIL = document.getElementById('signup-email');
const SIGNUP_NAME = document.getElementById('signup-name');
const SIGNUP_PASS = document.getElementById('signup-pass');
const LOGIN_EMAIL = document.getElementById('login-email');
const LOGIN_PASS = document.getElementById('login-pass');
const BTN = document.getElementById('btn');
const BTN1 = document.getElementById('btn1');
const GOOGLE_BTNS = document.querySelectorAll('.btn-google');
const loginStreak = document.getElementById('login-streak');
const loginStreakCount = document.getElementById('login-streak-count');
const isLoginPage = window.location.pathname.toLowerCase().endsWith('/dashboard.html');
const loginNotificationTasks = new Map();

function displayLoginStreak(streak) {
  if (!loginStreak || !loginStreakCount) return;
  loginStreakCount.textContent = String(streak);
  loginStreak.setAttribute(
    'aria-label',
    `${streak} day${streak === 1 ? '' : 's'} login streak`
  );
  loginStreak.title = `${streak} day${streak === 1 ? '' : 's'} login streak`;
}

async function recordLoginStreak() {
  const { data, error } = await supabase.rpc('record_login_streak');
  if (error) throw error;
  if (!Number.isInteger(data) || data < 1) {
    throw new Error('Supabase returned an invalid login streak.');
  }
  displayLoginStreak(data);
}

function recordLoginOnce(user, session) {
  const storageKey = `gamer-studio-login-notified:${user.id}`;
  const sessionExpiry = String(session?.expires_at || '');
  const completedMarker = `${sessionExpiry}:done`;
  const pendingPrefix = `${sessionExpiry}:pending:`;
  const pendingMarker = `${pendingPrefix}${Date.now()}`;
  const existingMarker = localStorage.getItem(storageKey);
  if (existingMarker === completedMarker) return Promise.resolve();
  if (loginNotificationTasks.has(user.id)) return loginNotificationTasks.get(user.id);
  if (existingMarker?.startsWith(pendingPrefix)) {
    const pendingAt = Number(existingMarker.slice(pendingPrefix.length));
    if (Date.now() - pendingAt < 30000) return Promise.resolve();
  }

  localStorage.setItem(storageKey, pendingMarker);
  const task = supabase.rpc('record_login_notification')
    .then(({ error }) => {
      if (error) throw error;
      localStorage.setItem(storageKey, completedMarker);
    })
    .catch((error) => {
      if (localStorage.getItem(storageKey) === pendingMarker) {
        localStorage.removeItem(storageKey);
      }
      throw error;
    })
    .finally(() => loginNotificationTasks.delete(user.id));
  loginNotificationTasks.set(user.id, task);
  return task;
}

function getDisplayName(user) {
  return user.user_metadata?.display_name
    || user.user_metadata?.name
    || user.email?.split('@')[0]
    || 'Gamer';
}

function isMissingSchemaObject(error) {
  const knownSchemaErrors = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);
  return knownSchemaErrors.has(error?.code)
    || /could not find the table .* in the schema cache|could not find the .* column .* in the schema cache|relation .* does not exist|column .* does not exist/i
      .test(error?.message || '');
}

const VOICE_NOTE_BUCKET = 'voice-notes';
const MESSAGE_MEDIA_BUCKET = 'message-media';

async function uploadVoiceNote(blob, extension) {
  const user = await getCurrentUser();
  if (!(blob instanceof Blob) || !blob.size) throw new Error('Record a voice note before sending.');
  if (blob.size > 10 * 1024 * 1024) throw new Error('Voice notes must be 10 MB or smaller.');

  const voicePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const contentType = (blob.type || 'audio/webm').split(';')[0];
  const { error } = await supabase.storage
    .from(VOICE_NOTE_BUCKET)
    .upload(voicePath, blob, { contentType, upsert: false });
  if (error) throw error;
  return voicePath;
}

async function removeVoiceNote(voicePath) {
  if (!voicePath) return;
  const { error } = await supabase.storage.from(VOICE_NOTE_BUCKET).remove([voicePath]);
  if (error && !/object not found|not found|404/i.test(error.message || '')) throw error;
}

async function uploadMessageMedia(blob, extension, contentType) {
  const user = await getCurrentUser();
  if (!(blob instanceof Blob) || !blob.size) throw new Error('Choose an image or video before sending.');
  if (blob.size > 20 * 1024 * 1024) throw new Error('Compressed attachments must be 20 MB or smaller.');

  const mediaPath = `${user.id}/${crypto.randomUUID()}.${extension}`;
  const baseContentType = contentType.split(';')[0];
  const { error } = await supabase.storage
    .from(MESSAGE_MEDIA_BUCKET)
    .upload(mediaPath, blob, { contentType: baseContentType, upsert: false });
  if (error) throw error;
  return mediaPath;
}

async function removeMessageMedia(mediaPath) {
  if (!mediaPath) return;
  const { error } = await supabase.storage.from(MESSAGE_MEDIA_BUCKET).remove([mediaPath]);
  if (error) throw error;
}

async function attachMediaUrls(messages) {
  return Promise.all(messages.map(async (message) => {
    if (!message.media_path) return message;
    const { data, error } = await supabase.storage
      .from(MESSAGE_MEDIA_BUCKET)
      .createSignedUrl(message.media_path, 24 * 60 * 60);
    if (error) {
      console.error(`Unable to create a signed URL for message attachment ${message.id}:`, error);
      return {
        ...message,
        media_error: `${error.message || 'Storage access failed.'} If the file still exists, apply the latest supabase-schema.sql to restore message-media access.`
      };
    }
    return { ...message, media_url: data.signedUrl };
  }));
}

async function attachVoiceUrls(messages) {
  return Promise.all(messages.map(async (message) => {
    if (!message.voice_path) return message;
    const { data, error } = await supabase.storage
      .from(VOICE_NOTE_BUCKET)
      .createSignedUrl(message.voice_path, 24 * 60 * 60);
    if (error) {
      console.error(`Unable to create a signed URL for voice note ${message.id}:`, error);
      const isMissingObject = /object not found|not found|404/i.test(error.message || '');
      return {
        ...message,
        voice_error: isMissingObject
          ? 'The audio file was not found or is inaccessible in voice-note storage. You can still delete this message; ask the sender to resend it if you need the recording.'
          : `${error.message || 'Storage access failed.'} Apply the latest supabase-schema.sql to restore voice-note access.`
      };
    }
    return { ...message, voice_url: data.signedUrl };
  }));
}

export async function refreshVoiceNoteUrl(voicePath) {
  await getCurrentUser();
  if (!voicePath) throw new Error('This message has no voice-note file path.');
  const { data, error } = await supabase.storage
    .from(VOICE_NOTE_BUCKET)
    .createSignedUrl(voicePath, 24 * 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

function publishProfile(user) {
  if (!user) return;

  const gamerName = getDisplayName(user);
  localStorage.setItem('gamerName', gamerName);
  window.dispatchEvent(new CustomEvent('gamer-profile-updated', {
    detail: {
      name: gamerName,
      photoURL: user.user_metadata?.avatar_url || ''
    }
  }));
}

supabase.auth.onAuthStateChange((event, session) => {
  const user = session?.user;
  if (user) publishProfile(user);

  if (user && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
    setTimeout(() => {
      recordLoginOnce(user, session).catch((error) => {
        console.error('Unable to create sign-in notification:', error);
      });
      recordLoginStreak().catch((error) => {
        console.error('Unable to update login streak:', error);
      });
    }, 0);
  } else if (event === 'SIGNED_OUT') {
    Object.keys(localStorage)
      .filter((key) => key.startsWith('gamer-studio-login-notified:'))
      .forEach((key) => localStorage.removeItem(key));
  }

  if (isLoginPage && user) {
    window.location.replace('index.html');
  } else if (!isLoginPage && event === 'SIGNED_OUT') {
    window.location.replace('dashboard.html');
  } else if (!isLoginPage && event === 'INITIAL_SESSION' && !user) {
    window.location.replace('dashboard.html');
  }
});

if (SIGNUP_FORM && BTN) {
  SIGNUP_FORM.addEventListener('submit', async (event) => {
    event.preventDefault();
    BTN.disabled = true;
    BTN.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.id = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const signupStatus = document.createElement('span');
    signupStatus.textContent = 'Creating account…';
    BTN.replaceChildren(spinner, signupStatus);

    try {
      const { data, error } = await supabase.auth.signUp({
        email: SIGNUP_EMAIL.value.trim(),
        password: SIGNUP_PASS.value,
        options: {
          data: { display_name: SIGNUP_NAME.value.trim() },
          emailRedirectTo: new URL('index.html', window.location.href).href
        }
      });
      if (error) throw error;

      SIGNUP_FORM.reset();
      if (data.session) {
        try {
          await recordLoginOnce(data.user, data.session);
        } catch (notificationError) {
          console.error('Unable to create sign-in notification:', notificationError);
        }
        window.location.replace('index.html');
      } else {
        const signupContainer = document.getElementById('container1');
        const loginContainer = document.getElementById('container2');
        if (signupContainer) signupContainer.style.display = 'none';
        if (loginContainer) loginContainer.style.display = 'flex';
        if (LOGIN_FORM) LOGIN_FORM.style.display = '';
        alert('Your account was created. If email confirmation is enabled, confirm your email first, then log in to continue.');
      }
    } catch (error) {
      console.error('Unable to create account:', error);
      alert(error.message || 'Unable to create your account. Please try again.');
    } finally {
      BTN.textContent = 'Sign Up';
      BTN.disabled = false;
      BTN.removeAttribute('aria-busy');
    }
  });
}

if (LOGIN_FORM && BTN1) {
  LOGIN_FORM.addEventListener('submit', async (event) => {
    event.preventDefault();
    BTN1.disabled = true;
    BTN1.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.id = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    const loginStatus = document.createElement('span');
    loginStatus.textContent = 'Logging in…';
    BTN1.replaceChildren(spinner, loginStatus);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: LOGIN_EMAIL.value.trim(),
        password: LOGIN_PASS.value
      });
      if (error) throw error;

      try {
        await recordLoginOnce(data.user, data.session);
      } catch (notificationError) {
        console.error('Unable to create sign-in notification:', notificationError);
      }
      publishProfile(data.user);
      LOGIN_FORM.reset();
      window.location.replace('index.html');
    } catch (error) {
      console.error('Unable to log in:', error);
      alert(error.message || 'Unable to log in. Please try again.');
    } finally {
      BTN1.textContent = 'Log In';
      BTN1.disabled = false;
      BTN1.removeAttribute('aria-busy');
    }
  });
}

GOOGLE_BTNS.forEach((button) => {
  const label = button.querySelector('span');
  const originalLabel = label?.textContent || 'Continue with Google';

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    if (button.disabled) return;

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    const spinner = document.createElement('span');
    spinner.id = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    if (label) {
      label.textContent = 'Connecting to Google…';
      button.prepend(spinner);
    }

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: new URL('/index.html', window.location.origin).href
        }
      });
      if (error) throw error;
    } catch (error) {
      console.error('Unable to continue with Google:', error);
      const message = /provider is not enabled|unsupported provider/i.test(error.message || '')
        ? 'Google sign-in is not enabled yet. Enable Google in Supabase Authentication > Providers and configure its OAuth credentials and redirect URLs.'
        : error.message || 'Unable to continue with Google. Please try again.';
      alert(message);
      spinner.remove();
      if (label) label.textContent = originalLabel;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  });
});

export async function signOutUser() {
  if ('serviceWorker' in navigator && 'PushManager' in window) {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      const { data, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (data.user) {
        const { error: deleteError } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint)
          .eq('user_id', data.user.id);
        if (deleteError) throw deleteError;
      }
      const unsubscribed = await subscription.unsubscribe();
      if (!unsubscribed) {
        throw new Error('Phone notifications could not be turned off before signing out.');
      }
    }
  }

  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

LOGOUT?.addEventListener('click', async () => {
  try {
    await signOutUser();
  } catch (error) {
    console.error('Unable to log out:', error);
    alert(error.message || 'Unable to log out. Please try again.');
  }
});

function getCurrentUser() {
  return supabase.auth.getUser().then(({ data, error }) => {
    if (error) throw error;
    if (!data.user) throw new Error('Sign in to continue');
    return data.user;
  });
}

function isSchemaCompatibilityError(error) {
  return ['42P01', '42703', 'PGRST200', 'PGRST201', 'PGRST202', 'PGRST204', 'PGRST205']
    .includes(error?.code)
    || /column .* does not exist|relation .* does not exist|could not find a relationship|could not find the function .* in the schema cache/i
      .test(error?.message || '');
}

async function optimizeImageUpload(file, maxDimension = 1600) {
  if (!file?.type.startsWith('image/')) return { blob: file, type: file?.type || '' };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (error) {
    throw new Error('This image could not be decoded for compression.', { cause: error });
  }

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
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

  const compressed = await new Promise((resolve) => {
    canvas.toBlob(resolve, 'image/webp', 0.78);
  });
  if (!compressed) throw new Error('This image could not be compressed.');
  return compressed.size < file.size
    ? { blob: compressed, type: compressed.type || 'image/webp' }
    : { blob: file, type: file.type };
}

export async function markAllDirectMessagesRead() {
  await getCurrentUser();
  const { error } = await supabase.rpc('mark_all_direct_messages_read');
  if (error) throw error;
}

let lastExpiredMessageCleanupAt = 0;

export async function clearOldReadNotifications() {
  await getCurrentUser();
  const { error } = await supabase.rpc('clear_old_read_notifications');
  if (error) throw error;
  if (Date.now() - lastExpiredMessageCleanupAt >= 60 * 60 * 1000) {
    const { error: messageCleanupError } = await supabase.rpc('cleanup_expired_messages');
    if (messageCleanupError) throw messageCleanupError;
    lastExpiredMessageCleanupAt = Date.now();
  }
}

export async function uploadProfilePicture(file, onStatus = () => {}) {
  const user = await getCurrentUser();
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choose an image file');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 25 MB before compression.');
  }

  const optimizedImage = await optimizeImageUpload(file, 640);
  if (optimizedImage.blob.size > 5 * 1024 * 1024) {
    throw new Error('This image is still larger than 5 MB after compression.');
  }
  const extension = optimizedImage.type === 'image/webp'
    ? 'webp'
    : file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const filePath = `profile-pictures/${user.id}/avatar.${extension}`;
  onStatus('uploading');

  const { error: uploadError } = await supabase.storage
    .from('game assets')
    .upload(filePath, optimizedImage.blob, {
      cacheControl: '3600',
      contentType: optimizedImage.type,
      upsert: true
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('game assets')
    .getPublicUrl(filePath);
  const photoURL = `${urlData.publicUrl}?updated=${Date.now()}`;

  onStatus('saving');
  const { data: updatedUserData, error: updateError } = await supabase.auth.updateUser({
    data: { avatar_url: photoURL }
  });
  if (updateError) throw updateError;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      username: getDisplayName(updatedUserData.user || user),
      avatar_url: photoURL
    })
    .eq('id', user.id)
    .select('id')
    .single();
  if (profileError) throw profileError;

  return photoURL;
}

export async function uploadProfileBackground(file, onStatus = () => {}) {
  const user = await getCurrentUser();
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choose an image file');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 25 MB before compression.');
  }

  const optimizedImage = await optimizeImageUpload(file);
  if (optimizedImage.blob.size > 5 * 1024 * 1024) {
    throw new Error('This image is still larger than 5 MB after compression.');
  }
  const extension = optimizedImage.type === 'image/webp'
    ? 'webp'
    : file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const filePath = `background-pictures/${user.id}/${crypto.randomUUID()}.${extension}`;
  onStatus('uploading');
  const { error: uploadError } = await supabase.storage
    .from('game assets')
    .upload(filePath, optimizedImage.blob, {
      cacheControl: '3600',
      contentType: optimizedImage.type,
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('game assets')
    .getPublicUrl(filePath);
  const backgroundURL = `${urlData.publicUrl}?updated=${Date.now()}`;
  onStatus('saving');
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ background_image_url: backgroundURL })
    .eq('id', user.id)
    .select('id')
    .single();
  if (profileError) {
    const { error: cleanupError } = await supabase.storage
      .from('game assets')
      .remove([filePath]);
    if (cleanupError) console.error('Unable to clean up an unlinked profile background:', cleanupError);
    if (isMissingSchemaObject(profileError) && /background_image_url/i.test(profileError.message || '')) {
      throw new Error('Supabase still cannot see profiles.background_image_url. Run the latest supabase-profile-background-fix.sql in the SQL Editor for this project, wait for the schema refresh, then reload the app.');
    }
    throw profileError;
  }
  return backgroundURL;
}

export async function updateDisplayName(name) {
  const displayName = name.trim();
  if (!displayName) throw new Error('Enter a name before saving');
  if (displayName.length > 40) throw new Error('Name must be 40 characters or fewer');

  const { data, error } = await supabase.auth.updateUser({
    data: { display_name: displayName }
  });
  if (error) throw error;

  const photoURL = data.user.user_metadata?.avatar_url || '';
  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      username: displayName,
      avatar_url: photoURL || null
    })
    .eq('id', data.user.id)
    .select('id')
    .single();
  if (profileError) throw profileError;

  localStorage.setItem('gamerName', displayName);
  window.dispatchEvent(new CustomEvent('gamer-profile-updated', {
    detail: { name: displayName, photoURL }
  }));
  return displayName;
}

export async function updateProfileStatus(status) {
  const user = await getCurrentUser();
  const profileStatus = status.trim();
  if (profileStatus.length > 120) {
    throw new Error('Your status must be 120 characters or fewer');
  }

  let { data, error } = await supabase
    .from('profiles')
    .update({ profile_status: profileStatus || null })
    .eq('id', user.id)
    .select('profile_status')
    .single();

  if (error?.code === 'PGRST116') {
    const metadata = user.user_metadata || {};
    const username = metadata.display_name
      || metadata.name
      || user.email?.split('@')[0]
      || 'Gamer';
    const { data: insertedProfile, error: insertError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        username,
        avatar_url: metadata.avatar_url || null,
        profile_status: profileStatus || null
      }, { onConflict: 'id' })
      .select('profile_status')
      .single();
    data = insertedProfile;
    error = insertError;
  }

  if (error && isSchemaCompatibilityError(error)) {
    throw new Error('Profile status is not enabled in Supabase yet. Run the latest supabase-schema.sql in the Supabase SQL Editor, then reload and save again.');
  }
  if (error) throw error;
  return data.profile_status || '';
}

export async function createPost(content, mediaFile = null) {
  const user = await getCurrentUser();
  const postContent = content.trim();
  if (!postContent && !mediaFile) {
    throw new Error('Write a caption or choose an image or video');
  }

  let mediaPath = null;
  let mediaURL = null;
  let mediaType = null;

  if (mediaFile) {
    if (!mediaFile.type.startsWith('image/') && !mediaFile.type.startsWith('video/')) {
      throw new Error('Choose an image or video file');
    }
    if (mediaFile.type.startsWith('video/') && mediaFile.size > 5 * 1024 * 1024) {
      throw new Error('Videos on posts must be 5 MB or smaller.');
    }
    if (mediaFile.type.startsWith('image/') && mediaFile.size > 25 * 1024 * 1024) {
      throw new Error('Choose an image smaller than 25 MB before compression.');
    }

    const optimizedMedia = await optimizeImageUpload(mediaFile);
    if (optimizedMedia.blob.size > 5 * 1024 * 1024) {
      throw new Error(mediaFile.type.startsWith('image/')
        ? 'This image is still larger than 5 MB after compression.'
        : 'Videos on posts must be 5 MB or smaller.');
    }
    const extension = optimizedMedia.type === 'image/webp'
      ? 'webp'
      : mediaFile.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'media';
    mediaPath = `posts/${user.id}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('game assets')
      .upload(mediaPath, optimizedMedia.blob, {
        cacheControl: '3600',
        contentType: optimizedMedia.type,
        upsert: false
      });
    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('game assets')
      .getPublicUrl(mediaPath);
    mediaURL = urlData.publicUrl;
    mediaType = mediaFile.type.startsWith('video/') ? 'video' : 'image';
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({
      user_id: user.id,
      username: getDisplayName(user),
      content: postContent,
      media_url: mediaURL,
      media_type: mediaType
    })
    .select('id, user_id, username, media_url, media_type')
    .single();
  if (error) {
    if (mediaPath) {
      const { error: cleanupError } = await supabase.storage
        .from('game assets')
        .remove([mediaPath]);
      if (cleanupError) {
        console.error('Unable to remove media after post creation failed:', cleanupError);
      }
    }
    throw error;
  }
  return {
    ...data,
    avatar_url: user.user_metadata?.avatar_url || ''
  };
}

export async function deletePost(postId) {
  const user = await getCurrentUser();
  const { data: post, error: lookupError } = await supabase
    .from('posts')
    .select('id, media_url')
    .eq('id', postId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!post) throw new Error('This post no longer exists or you cannot delete it.');

  const { data: deletedPosts, error: deleteError } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .eq('user_id', user.id)
    .select('id');
  if (deleteError) {
    if (deleteError.code === '42501' || deleteError.code === 'PGRST301') {
      throw new Error('Supabase blocked post deletion. Run supabase-post-delete.sql in the Supabase SQL Editor, then try again.');
    }
    throw deleteError;
  }
  if (!deletedPosts.length) {
    throw new Error('Supabase did not delete this post. Run supabase-post-delete.sql in the Supabase SQL Editor, then try again.');
  }

  if (!post.media_url) return { mediaCleanupFailed: false };

  try {
    const mediaURL = new URL(post.media_url);
    const publicObjectPrefix = '/storage/v1/object/public/';
    const publicObjectPath = mediaURL.pathname.split(publicObjectPrefix)[1];
    if (!publicObjectPath) throw new Error('Post media URL is not a public Storage URL.');

    const [encodedBucket, ...encodedPathParts] = publicObjectPath.split('/');
    const bucketName = decodeURIComponent(encodedBucket);
    if (bucketName !== 'game assets' || !encodedPathParts.length) {
      throw new Error('Post media URL does not point to the expected Storage bucket.');
    }
    const mediaPath = encodedPathParts.map((part) => decodeURIComponent(part)).join('/');
    const { error: removeError } = await supabase.storage
      .from('game assets')
      .remove([mediaPath]);
    if (removeError) throw removeError;
    return { mediaCleanupFailed: false };
  } catch (mediaCleanupError) {
    console.error('Post was deleted, but its uploaded media could not be removed:', mediaCleanupError);
    return { mediaCleanupFailed: true };
  }
}

export async function togglePostLike(postId) {
  await getCurrentUser();
  const { data, error } = await supabase.rpc('toggle_post_like', {
    p_post_id: postId
  });
  if (error) throw error;
  return {
    liked: data.liked,
    likesCount: data.likesCount
  };
}

export async function toggleFollow(followedUserId) {
  await getCurrentUser();
  const { data, error } = await supabase.rpc('toggle_follow', {
    p_followed_id: followedUserId
  });
  if (error) throw error;
  return data.following;
}

export async function getNotifications() {
  const user = await getCurrentUser();
  const [notificationResult, unreadResult, unreadMessageResult] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, actor_id, post_id, type, message, created_at, read_at')
      .eq('recipient_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .is('read_at', null),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('type', 'direct_message')
      .is('read_at', null)
  ]);
  if (notificationResult.error) throw notificationResult.error;
  if (unreadResult.error) throw unreadResult.error;
  if (unreadMessageResult.error) throw unreadMessageResult.error;
  const unreadCount = unreadResult.count || 0;
  const unreadMessageCount = unreadMessageResult.count || 0;
  return {
    notifications: notificationResult.data,
    unreadCount,
    unreadMessageCount,
    unreadSocialCount: Math.max(0, unreadCount - unreadMessageCount)
  };
}

export async function markNotificationRead(notificationId) {
  const user = await getCurrentUser();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .eq('recipient_id', user.id)
    .is('read_at', null);
  if (error) throw error;
}

export async function deleteReadAppInstallNotification(notificationId) {
  const { error } = await supabase.rpc('delete_read_app_install_notification', {
    p_notification_id: notificationId
  });
  if (error) throw error;
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null);
  if (error) throw error;
}

export async function getMessageContacts(searchTerm) {
  await getCurrentUser();
  const { data, error } = await supabase.rpc('search_gamers', {
    search_term: searchTerm.trim()
  });
  if (error) throw error;
  return data;
}

export async function sendFriendRequest(gamerId) {
  await getCurrentUser();
  const { data, error } = await supabase.rpc('send_friend_request', {
    p_recipient_id: gamerId
  });
  if (error) throw error;
  return data.status;
}

export async function getFriendshipStatus(gamerId) {
  const user = await getCurrentUser();
  const { data: requests, error } = await supabase
    .from('friend_requests')
    .select('id, requester_id, recipient_id, status, created_at')
    .or(`and(requester_id.eq.${user.id},recipient_id.eq.${gamerId}),and(requester_id.eq.${gamerId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  const request = requests[0];
  if (!request) return { status: 'none', requestId: null };
  if (request.status === 'accepted') return { status: 'friends', requestId: request.id };
  if (request.status !== 'pending') return { status: 'none', requestId: null };
  return {
    status: request.requester_id === user.id ? 'request_sent' : 'request_received',
    requestId: request.id
  };
}

export async function getPendingFriendRequests() {
  const user = await getCurrentUser();
  const { data: requests, error } = await supabase
    .from('friend_requests')
    .select('id, requester_id, created_at')
    .eq('recipient_id', user.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!requests.length) return [];

  const requesterIds = requests.map((request) => request.requester_id);
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', requesterIds);
  if (profilesError) throw profilesError;

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return requests.map((request) => ({
    ...request,
    profile: profilesById.get(request.requester_id) || {
      id: request.requester_id,
      username: 'Gamer',
      avatar_url: ''
    }
  }));
}

export async function getAcceptedFriends() {
  const user = await getCurrentUser();
  const { data: requests, error } = await supabase
    .from('friend_requests')
    .select('requester_id, recipient_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`);
  if (error) throw error;
  const friendIds = [...new Set(requests.map((request) => (
    request.requester_id === user.id ? request.recipient_id : request.requester_id
  )))];
  if (!friendIds.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', friendIds)
    .order('username', { ascending: true });
  if (profilesError) throw profilesError;
  return profiles;
}

export async function respondToFriendRequest(requestId, accept) {
  await getCurrentUser();
  const { data, error } = await supabase.rpc('respond_to_friend_request', {
    p_request_id: requestId,
    p_accept: accept
  });
  if (error) throw error;
  return data.status;
}

export async function getMessageProfile(gamerId) {
  await getCurrentUser();
  let { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, background_image_url, profile_status')
    .eq('id', gamerId)
    .single();
  if (
    error
    && isMissingSchemaObject(error)
    && /background_image_url/i.test(error.message || '')
  ) {
    console.warn('Profile cover images are unavailable until profiles.background_image_url is added.');
    ({ data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, profile_status')
      .eq('id', gamerId)
      .single());
    if (data) data.background_image_url = '';
  }
  if (error) throw error;
  return data;
}

const CLEARED_CONVERSATIONS_STORAGE_KEY = 'gamer-studio-cleared-conversations';

async function getClearedConversations(userId, conversationType) {
  const allClears = JSON.parse(localStorage.getItem(CLEARED_CONVERSATIONS_STORAGE_KEY) || '{}');
  const userClears = allClears[userId] || {};
  return new Map(Object.entries(userClears[conversationType] || {}));
}

export async function hideMessageConversation(conversationType, conversationId) {
  const user = await getCurrentUser();
  if (!['direct', 'group'].includes(conversationType)) {
    throw new Error('Invalid conversation type');
  }
  const allClears = JSON.parse(localStorage.getItem(CLEARED_CONVERSATIONS_STORAGE_KEY) || '{}');
  const userClears = allClears[user.id] || {};
  const typeClears = userClears[conversationType] || {};
  typeClears[conversationId] = new Date().toISOString();
  userClears[conversationType] = typeClears;
  allClears[user.id] = userClears;
  localStorage.setItem(CLEARED_CONVERSATIONS_STORAGE_KEY, JSON.stringify(allClears));
}

export async function getMessageConversations() {
  const user = await getCurrentUser();
  const clearedConversations = await getClearedConversations(user.id, 'direct');
  let { data: messages, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, content, created_at, read_at')
    .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error && isSchemaCompatibilityError(error)) {
    console.warn('Loading direct chats without optional message-read metadata; apply the latest Supabase schema to enable all messaging features.');
    ({ data: messages, error } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, created_at')
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(500));
  }
  if (error) throw error;

  const latestByGamer = new Map();
  for (const message of messages) {
    const gamerId = message.sender_id === user.id ? message.recipient_id : message.sender_id;
    if (latestByGamer.has(gamerId)) continue;
    const clearedAt = clearedConversations.get(gamerId);
    if (!clearedAt || new Date(message.created_at) > new Date(clearedAt)) {
      latestByGamer.set(gamerId, message);
    }
  }
  if (!latestByGamer.size) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', [...latestByGamer.keys()]);
  if (profilesError) throw profilesError;

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  return [...latestByGamer.entries()].map(([gamerId, latestMessage]) => ({
    ...(profilesById.get(gamerId) || { id: gamerId, username: 'Gamer', avatar_url: '' }),
    latestMessage
  }));
}

export async function getDirectMessages(gamerId) {
  const user = await getCurrentUser();
  if (gamerId === user.id) throw new Error('You cannot message yourself');

  let { data: messages, error } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, content, voice_path, media_path, media_type, created_at, edited_at, read_at, reply_to_id, reply:direct_messages!direct_messages_reply_to_id_fkey(id, content, voice_path, sender_id)')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${gamerId}),and(sender_id.eq.${gamerId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error && isSchemaCompatibilityError(error)) {
    console.warn('Loading direct messages without optional edit, read, and reply fields; apply the latest Supabase schema to enable all messaging features.');
    ({ data: messages, error } = await supabase
      .from('direct_messages')
      .select('id, sender_id, recipient_id, content, voice_path, created_at')
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${gamerId}),and(sender_id.eq.${gamerId},recipient_id.eq.${user.id})`)
      .order('created_at', { ascending: false })
      .limit(100));
    if (error && isSchemaCompatibilityError(error)) {
      console.warn('Voice notes are unavailable until the voice_path column is added to direct messages.');
      ({ data: messages, error } = await supabase
        .from('direct_messages')
        .select('id, sender_id, recipient_id, content, created_at')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${gamerId}),and(sender_id.eq.${gamerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: false })
        .limit(100));
    }
  }
  if (error) throw error;

  const messageIds = messages.map((message) => message.id);
  let reactions = [];
  if (messageIds.length) {
    const { data, error: reactionsError } = await supabase
      .from('direct_message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', messageIds);
    if (reactionsError && isSchemaCompatibilityError(reactionsError)) {
      console.warn('Message reactions are unavailable until the latest Supabase schema is applied.');
    } else if (reactionsError) {
      throw reactionsError;
    } else {
      reactions = data;
    }
  }

  const reactionsByMessage = new Map();
  for (const reaction of reactions) {
    const messageReactions = reactionsByMessage.get(reaction.message_id) || [];
    messageReactions.push({
      emoji: reaction.emoji,
      userId: reaction.user_id,
      isOwnReaction: reaction.user_id === user.id
    });
    reactionsByMessage.set(reaction.message_id, messageReactions);
  }

  const messagesWithVoices = await attachVoiceUrls(messages);
  const messagesWithMedia = await attachMediaUrls(messagesWithVoices);
  return messagesWithMedia.reverse().map((message) => ({
    ...message,
    isOwnMessage: message.sender_id === user.id,
    reactions: reactionsByMessage.get(message.id) || []
  }));
}

export async function sendDirectMessage(gamerId, content) {
  return sendDirectMessageReply(gamerId, content, null);
}

export async function sendDirectMessageReply(gamerId, content, replyToId) {
  const user = await getCurrentUser();
  const messageContent = content.trim();
  if (gamerId === user.id) throw new Error('You cannot message yourself');
  if (!messageContent) throw new Error('Write a message before sending');
  if (messageContent.length > 2000) throw new Error('Messages must be 2,000 characters or fewer');

  const message = {
    sender_id: user.id,
    recipient_id: gamerId,
    content: messageContent
  };
  if (replyToId) message.reply_to_id = replyToId;
  const { error } = await supabase.from('direct_messages').insert(message);
  if (error) throw error;
}

export async function sendDirectVoiceMessage(gamerId, blob, extension, replyToId = null) {
  const user = await getCurrentUser();
  if (gamerId === user.id) throw new Error('You cannot message yourself');
  const voicePath = await uploadVoiceNote(blob, extension);
  const message = {
    sender_id: user.id,
    recipient_id: gamerId,
    content: null,
    voice_path: voicePath
  };
  if (replyToId) message.reply_to_id = replyToId;
  const { error } = await supabase.from('direct_messages').insert(message);
  if (error) {
    try {
      await removeVoiceNote(voicePath);
    } catch (cleanupError) {
      console.error('Unable to remove an unsent voice note:', cleanupError);
    }
    throw error;
  }
}

export async function sendDirectMediaMessage(gamerId, content, blob, extension, contentType) {
  const user = await getCurrentUser();
  if (gamerId === user.id) throw new Error('You cannot message yourself');
  const messageContent = content.trim();
  if (messageContent.length > 2000) throw new Error('Messages must be 2,000 characters or fewer');
  const mediaPath = await uploadMessageMedia(blob, extension, contentType);
  const { error } = await supabase.from('direct_messages').insert({
    sender_id: user.id,
    recipient_id: gamerId,
    content: messageContent || null,
    media_path: mediaPath,
    media_type: contentType.startsWith('video/') ? 'video' : 'image'
  });
  if (error) {
    try {
      await removeMessageMedia(mediaPath);
    } catch (cleanupError) {
      console.error('Unable to remove an unsent message attachment:', cleanupError);
    }
    throw error;
  }
}

export async function createGroupChat(name, memberIds) {
  const user = await getCurrentUser();
  const groupName = name.trim();
  const participantIds = [...new Set(memberIds)].filter((id) => id !== user.id);
  if (!groupName) throw new Error('Enter a name for the group');
  if (groupName.length > 60) throw new Error('Group names must be 60 characters or fewer');
  if (!participantIds.length) throw new Error('Choose at least one gamer to add');

  let { data: group, error: groupError } = await supabase
    .from('group_chats')
    .insert({ name: groupName, created_by: user.id })
    .select('id, name, avatar_url, created_by')
    .single();
  if (
    groupError
    && ['42703', 'PGRST204'].includes(groupError.code)
    && /avatar_url/i.test(groupError.message || '')
  ) {
    console.warn('Group pictures are unavailable until the group_chats.avatar_url column is added.');
    ({ data: group, error: groupError } = await supabase
      .from('group_chats')
      .insert({ name: groupName, created_by: user.id })
      .select('id, name, created_by')
      .single());
    if (group) group.avatar_url = '';
  }
  if (groupError) throw groupError;

  const members = [user.id, ...participantIds].map((userId) => ({
    group_id: group.id,
    user_id: userId
  }));
  const { error: memberError } = await supabase.from('group_chat_members').insert(members);
  if (memberError) {
    const { error: cleanupError } = await supabase.from('group_chats').delete().eq('id', group.id);
    if (cleanupError) {
      console.error('Unable to clean up an incompletely created group:', cleanupError);
    }
    throw memberError;
  }
  return group;
}

export async function uploadGroupPicture(groupId, file) {
  const user = await getCurrentUser();
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Choose an image file');
  }
  if (file.size > 25 * 1024 * 1024) {
    throw new Error('Choose an image smaller than 25 MB before compression.');
  }

  const optimizedImage = await optimizeImageUpload(file, 640);
  if (optimizedImage.blob.size > 5 * 1024 * 1024) {
    throw new Error('This image is still larger than 5 MB after compression.');
  }
  const extension = optimizedImage.type === 'image/webp'
    ? 'webp'
    : file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'img';
  const filePath = `group-pictures/${groupId}/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('game assets')
    .upload(filePath, optimizedImage.blob, {
      cacheControl: '3600',
      contentType: optimizedImage.type,
      upsert: false
    });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage
    .from('game assets')
    .getPublicUrl(filePath);
  const avatarURL = `${urlData.publicUrl}?updated=${Date.now()}`;
  const { data, error } = await supabase
    .from('group_chats')
    .update({ avatar_url: avatarURL })
    .eq('id', groupId)
    .eq('created_by', user.id)
    .select('id, name, avatar_url, created_by')
    .single();

  if (error) {
    const { error: cleanupError } = await supabase.storage
      .from('game assets')
      .remove([filePath]);
    if (cleanupError) console.error('Unable to clean up an unlinked group picture:', cleanupError);
    if (
      ['42703', 'PGRST204'].includes(error.code)
      && /avatar_url/i.test(error.message || '')
    ) {
      throw new Error('Group pictures are not enabled yet. Run the latest supabase-schema.sql in the Supabase SQL Editor, then try again.');
    }
    throw error;
  }
  return data;
}

export async function getGroupConversations() {
  const user = await getCurrentUser();
  const { data: memberships, error: membershipsError } = await supabase
    .from('group_chat_members')
    .select('group_id')
    .eq('user_id', user.id);
  if (membershipsError) throw membershipsError;
  const groupIds = memberships.map((membership) => membership.group_id);
  if (!groupIds.length) return [];
  const clearedConversations = await getClearedConversations(user.id, 'group');

  let [groupsResult, messagesResult] = await Promise.all([
    supabase.from('group_chats').select('id, name, avatar_url, created_by').in('id', groupIds),
    supabase
      .from('group_messages')
      .select('id, group_id, sender_id, content, created_at')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);
  if (
    groupsResult.error
    && ['42703', 'PGRST204'].includes(groupsResult.error.code)
    && /avatar_url/i.test(groupsResult.error.message || '')
  ) {
    console.warn('Group pictures are unavailable until the group_chats.avatar_url column is added.');
    groupsResult = await supabase
      .from('group_chats')
      .select('id, name, created_by')
      .in('id', groupIds);
    groupsResult.data?.forEach((group) => {
      group.avatar_url = '';
    });
  }
  if (groupsResult.error) throw groupsResult.error;
  if (messagesResult.error) throw messagesResult.error;

  const latestByGroup = new Map();
  for (const message of messagesResult.data) {
    if (!latestByGroup.has(message.group_id)) latestByGroup.set(message.group_id, message);
  }
  return groupsResult.data
    .filter((group) => {
      const clearedAt = clearedConversations.get(group.id);
      const latestMessage = latestByGroup.get(group.id);
      return !clearedAt || (latestMessage && new Date(latestMessage.created_at) > new Date(clearedAt));
    })
    .map((group) => ({
      ...group,
      isGroup: true,
      latestMessage: latestByGroup.get(group.id) || null
    }))
    .sort((left, right) => (
      (right.latestMessage?.created_at || '').localeCompare(left.latestMessage?.created_at || '')
    ));
}

export async function getGroupMessages(groupId) {
  const user = await getCurrentUser();
  let { data: messages, error } = await supabase
    .from('group_messages')
    .select('id, group_id, sender_id, content, voice_path, media_path, media_type, created_at, reply_to_id')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (
    error
    && isSchemaCompatibilityError(error)
    && /media_path|media_type/i.test(error.message || '')
  ) {
    console.warn('Group message attachments are unavailable until supabase-group-message-media-fix.sql has been applied.');
    ({ data: messages, error } = await supabase
      .from('group_messages')
      .select('id, group_id, sender_id, content, voice_path, created_at, reply_to_id')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })
      .limit(100));
  }
  if (error) throw error;

  const replyIds = [...new Set(messages.map((message) => message.reply_to_id).filter(Boolean))];
  const repliesResult = replyIds.length
    ? await supabase
      .from('group_messages')
      .select('id, content, sender_id')
      .in('id', replyIds)
    : { data: [], error: null };
  if (repliesResult.error) throw repliesResult.error;
  const senderIds = [...new Set([
    ...messages.map((message) => message.sender_id),
    ...repliesResult.data.map((reply) => reply.sender_id)
  ])];
  const [profilesResult, messagesWithVoices, groupReactionsResult] = await Promise.all([
    senderIds.length
      ? supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .in('id', senderIds)
      : Promise.resolve({ data: [], error: null }),
    attachVoiceUrls(messages)
      .then(attachMediaUrls),
    messages.length
      ? supabase
        .from('group_message_reactions')
        .select('message_id, user_id, emoji')
        .in('message_id', messages.map((message) => message.id))
      : Promise.resolve({ data: [], error: null })
  ]);
  const { data: profiles, error: profilesError } = profilesResult;
  if (profilesError) throw profilesError;
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const repliesById = new Map(repliesResult.data.map((reply) => [reply.id, reply]));
  if (groupReactionsResult.error && !isSchemaCompatibilityError(groupReactionsResult.error)) {
    throw groupReactionsResult.error;
  }
  if (groupReactionsResult.error) {
    console.warn('Group message reactions are unavailable until the latest Supabase schema is applied.');
  }
  const reactionsByMessage = new Map();
  for (const reaction of groupReactionsResult.data || []) {
    const messageReactions = reactionsByMessage.get(reaction.message_id) || [];
    messageReactions.push({
      emoji: reaction.emoji,
      userId: reaction.user_id,
      isOwnReaction: reaction.user_id === user.id
    });
    reactionsByMessage.set(reaction.message_id, messageReactions);
  }
  return messagesWithVoices.reverse().map((message) => ({
    ...message,
    isOwnMessage: message.sender_id === user.id,
    senderName: profilesById.get(message.sender_id)?.username || 'Gamer',
    reactions: reactionsByMessage.get(message.id) || [],
    reply: repliesById.has(message.reply_to_id)
      ? {
        ...repliesById.get(message.reply_to_id),
        senderName: profilesById.get(repliesById.get(message.reply_to_id).sender_id)?.username || 'Gamer'
      }
      : null
  }));
}

export async function sendGroupMessage(groupId, content, replyToId = null) {
  const user = await getCurrentUser();
  const messageContent = content.trim();
  if (!messageContent) throw new Error('Write a message before sending');
  if (messageContent.length > 2000) throw new Error('Messages must be 2,000 characters or fewer');
  const message = {
    group_id: groupId,
    sender_id: user.id,
    content: messageContent
  };
  if (replyToId) message.reply_to_id = replyToId;
  const { error } = await supabase.from('group_messages').insert(message);
  if (error) throw error;
}

export async function sendGroupVoiceMessage(groupId, blob, extension, replyToId = null) {
  const user = await getCurrentUser();
  const voicePath = await uploadVoiceNote(blob, extension);
  const message = {
    group_id: groupId,
    sender_id: user.id,
    content: null,
    voice_path: voicePath
  };
  if (replyToId) message.reply_to_id = replyToId;
  const { error } = await supabase.from('group_messages').insert(message);
  if (error) {
    try {
      await removeVoiceNote(voicePath);
    } catch (cleanupError) {
      console.error('Unable to remove an unsent group voice note:', cleanupError);
    }
    throw error;
  }
}

export async function sendGroupMediaMessage(groupId, content, blob, extension, contentType) {
  const user = await getCurrentUser();
  const messageContent = content.trim();
  if (messageContent.length > 2000) throw new Error('Messages must be 2,000 characters or fewer');
  const mediaPath = await uploadMessageMedia(blob, extension, contentType);
  const { error } = await supabase.from('group_messages').insert({
    group_id: groupId,
    sender_id: user.id,
    content: messageContent || null,
    media_path: mediaPath,
    media_type: contentType.startsWith('video/') ? 'video' : 'image'
  });
  if (error) {
    try {
      await removeMessageMedia(mediaPath);
    } catch (cleanupError) {
      console.error('Unable to remove an unsent group attachment:', cleanupError);
    }
    throw error;
  }
}

export async function updateDirectMessage(messageId, content) {
  await getCurrentUser();
  const messageContent = content.trim();
  if (!messageContent) throw new Error('A message cannot be empty');
  if (messageContent.length > 2000) throw new Error('Messages must be 2,000 characters or fewer');

  const { error } = await supabase
    .from('direct_messages')
    .update({ content: messageContent, edited_at: new Date().toISOString() })
    .eq('id', messageId);
  if (error) throw error;
}

async function getOwnMessageForDeletion(table, messageId, senderId) {
  const columns = ['id, voice_path, media_path', 'id, voice_path', 'id'];
  let lastError;
  for (const selection of columns) {
    const { data, error } = await supabase
      .from(table)
      .select(selection)
      .eq('id', messageId)
      .eq('sender_id', senderId)
      .maybeSingle();
    if (!error) {
      if (!data) throw new Error('This message no longer exists or you cannot delete it.');
      return data;
    }
    lastError = error;
    if (!isSchemaCompatibilityError(error)) throw error;
  }
  throw lastError;
}

export async function deleteDirectMessage(messageId) {
  const user = await getCurrentUser();
  const message = await getOwnMessageForDeletion('direct_messages', messageId, user.id);

  const { data: deletedMessages, error } = await supabase
    .from('direct_messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', user.id)
    .select('id');
  if (error) throw error;
  if (!deletedMessages.length) {
    throw new Error(message.voice_path
      ? 'The voice note could not be deleted. Refresh the conversation and try again.'
      : 'The message could not be deleted. Refresh the conversation and try again.');
  }
  if (message?.voice_path) {
    try {
      await removeVoiceNote(message.voice_path);
    } catch (cleanupError) {
      console.error('Message was deleted, but its voice note could not be removed:', cleanupError);
      throw new Error('The message was deleted, but its voice recording could not be removed from storage.');
    }
  }
  if (message?.media_path) {
    try {
      await removeMessageMedia(message.media_path);
    } catch (cleanupError) {
      console.error('Message was deleted, but its attachment could not be removed:', cleanupError);
      throw new Error('The message was deleted, but its attachment could not be removed from storage.');
    }
  }
}

export async function deleteGroupMessage(messageId) {
  const user = await getCurrentUser();
  const message = await getOwnMessageForDeletion('group_messages', messageId, user.id);

  const { data: deletedMessages, error } = await supabase
    .from('group_messages')
    .delete()
    .eq('id', messageId)
    .eq('sender_id', user.id)
    .select('id');
  if (error) throw error;
  if (!deletedMessages.length) {
    throw new Error(message.voice_path
      ? 'The voice note could not be deleted. Refresh the conversation and try again.'
      : 'The message could not be deleted. Refresh the conversation and try again.');
  }
  if (message?.voice_path) {
    try {
      await removeVoiceNote(message.voice_path);
    } catch (cleanupError) {
      console.error('Group message was deleted, but its voice note could not be removed:', cleanupError);
      throw new Error('The message was deleted, but its voice recording could not be removed from storage.');
    }
  }
  if (message?.media_path) {
    try {
      await removeMessageMedia(message.media_path);
    } catch (cleanupError) {
      console.error('Group message was deleted, but its attachment could not be removed:', cleanupError);
      throw new Error('The message was deleted, but its attachment could not be removed from storage.');
    }
  }
}

export async function toggleDirectMessageReaction(messageId, emoji) {
  const user = await getCurrentUser();
  const allowedEmojis = ['👍', '❤️', '😂', '🔥', '😮'];
  if (!allowedEmojis.includes(emoji)) throw new Error('This reaction is not supported');

  const { data: existing, error: lookupError } = await supabase
    .from('direct_message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.emoji === emoji) {
    const { error } = await supabase
      .from('direct_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('direct_message_reactions')
    .upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

export async function toggleGroupMessageReaction(messageId, emoji) {
  const user = await getCurrentUser();
  const allowedEmojis = ['👍', '❤️', '😂', '🔥', '😮'];
  if (!allowedEmojis.includes(emoji)) throw new Error('This reaction is not supported');

  const { data: existing, error: lookupError } = await supabase
    .from('group_message_reactions')
    .select('emoji')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.emoji === emoji) {
    const { error } = await supabase
      .from('group_message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('group_message_reactions')
    .upsert({ message_id: messageId, user_id: user.id, emoji }, { onConflict: 'message_id,user_id' });
  if (error) throw error;
}

export async function getPostComments(postId) {
  await getCurrentUser();

  let { data, error } = await supabase
    .from('comments')
    .select('id, user_id, username, content, parent_comment_id, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true });
  if (
    error
    && isMissingSchemaObject(error)
    && /parent_comment_id/i.test(error.message || '')
  ) {
    console.warn('Comment replies are unavailable until supabase-comment-replies-fix.sql is applied.');
    ({ data, error } = await supabase
      .from('comments')
      .select('id, user_id, username, content, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: true }));
    if (data) data = data.map((comment) => ({ ...comment, parent_comment_id: null }));
  }
  if (error) throw error;
  if (!data.length) return [];

  const commenterIds = [...new Set(data.map((comment) => comment.user_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, avatar_url')
    .in('id', commenterIds);
  if (profilesError) throw profilesError;

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  return data.map((comment) => ({
    ...comment,
    avatarURL: profileById.get(comment.user_id)?.avatar_url || ''
  }));
}

export async function createPostComment(postId, content, parentCommentId = null) {
  const user = await getCurrentUser();
  const commentContent = content.trim();
  if (!commentContent) throw new Error('Write a comment before sending');
  if (commentContent.length > 2000) throw new Error('Comments must be 2,000 characters or fewer');

  let { data, error } = await supabase
    .from('comments')
    .insert({
      post_id: postId,
      user_id: user.id,
      username: getDisplayName(user),
      content: commentContent,
      ...(parentCommentId ? { parent_comment_id: parentCommentId } : {})
    })
    .select('id, user_id, username, content, parent_comment_id, created_at')
    .single();
  if (error && isMissingSchemaObject(error) && /parent_comment_id/i.test(error.message || '')) {
    if (parentCommentId) {
      throw new Error('Comment replies are not enabled on this database yet. Run supabase-comment-replies-fix.sql in the Supabase SQL Editor.');
    }
    console.warn('Post comment replies are not enabled yet; saving this as a top-level comment.');
    ({ data, error } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: user.id,
        username: getDisplayName(user),
        content: commentContent
      })
      .select('id, user_id, username, content, created_at')
      .single());
    if (data) data.parent_comment_id = null;
  }
  if (error) throw error;
  return { ...data, avatarURL: user.user_metadata?.avatar_url || '' };
}

export async function getPosts() {
  const user = await getCurrentUser();
  let { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, user_id, username, content, created_at, likes_count, comments_count, media_url, media_type')
    .order('created_at', { ascending: false });
  let commentCounts = new Map();

  if (postsError && isMissingSchemaObject(postsError) && /comments_count/i.test(postsError.message || '')) {
    console.warn('Post comment-count migration is not applied; loading posts without saved comment counts.');
    ({ data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, user_id, username, content, created_at, likes_count, media_url, media_type')
      .order('created_at', { ascending: false }));

    if (!postsError && posts.length) {
      const { data: comments, error: commentsError } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', posts.map((post) => post.id));
      if (commentsError) {
        if (!isMissingSchemaObject(commentsError)) throw commentsError;
        console.warn('Post comments migration is not applied; displaying comment counts as zero.');
      } else {
        commentCounts = comments.reduce((counts, comment) => {
          counts.set(comment.post_id, (counts.get(comment.post_id) || 0) + 1);
          return counts;
        }, new Map());
      }
    }
  }
  if (postsError) throw postsError;
  if (!posts.length) return [];

  const authorIds = [...new Set(posts.map((post) => post.user_id))];
  const [likesResult, profilesResult, followsResult] = await Promise.all([
    supabase
      .from('post_likes')
      .select('post_id')
      .eq('user_id', user.id)
      .in('post_id', posts.map((post) => post.id)),
    supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', authorIds),
    supabase
      .from('follows')
      .select('followed_id')
      .eq('follower_id', user.id)
      .in('followed_id', authorIds)
  ]);
  if (likesResult.error) throw likesResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (followsResult.error && !isMissingSchemaObject(followsResult.error)) throw followsResult.error;
  if (followsResult.error) {
    console.warn('Follow migration is not applied; displaying Follow buttons until the schema is updated.');
  }

  const likedPostIds = new Set(likesResult.data.map((like) => like.post_id));
  const profilesById = new Map(profilesResult.data.map((profile) => [profile.id, profile]));
  const followedUserIds = new Set((followsResult.data || []).map((follow) => follow.followed_id));
  return posts.map((post) => ({
    id: post.id,
    uid: post.user_id,
    username: profilesById.get(post.user_id)?.username || post.username || 'Gamer',
    avatarURL: profilesById.get(post.user_id)?.avatar_url || '',
    isOwnPost: post.user_id === user.id,
    isFollowingAuthor: followedUserIds.has(post.user_id),
    content: post.content,
    mediaURL: post.media_url,
    mediaType: post.media_type,
    createdAt: post.created_at,
    likesCount: post.likes_count || 0,
    commentsCount: post.comments_count ?? commentCounts.get(post.id) ?? 0,
    likedByCurrentUser: likedPostIds.has(post.id)
  }));
}
