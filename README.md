# Gamer Studio

a social platform for gamers

## About

Gamer studio is a gaming focused social platform where gamers can connect,chat,share content,discover game news, and interact with other gamers.

## Features

Gamer news
Gamer feed
Chat
Notifications
Profiles
Follow gamers
Gaming community

## Supabase setup

1. In the Supabase SQL Editor, run `supabase-schema.sql` to create the profile,
   post, like, follow, comment, notification, and private direct-message tables,
   their row-level security policies, database triggers/functions, and the `game assets`
   bucket. Feed posts show the author's profile photo and name with a working
   Follow/Following button. Comments show commenter avatars and post comment
   counts. Gamers can search profiles and send private messages; only the sender
   and recipient can read a conversation. The Messages toolbar opens gamer
   search; each result has separate actions to open a conversation or send a
   friend request. Opening another gamer's profile offers an Add friend,
   Accept request, or Message action and updates accepted requests live. The
   Messages view keeps recent conversations in its
   sidebar and reserves the main area for the selected chat. Conversations
   show live typing status and play a short sound after a message is sent. In a
   conversation, long-press or right-click a message to choose a reaction, and
   swipe left or right on mobile to reply to a specific message, including voice
   notes. Senders can also edit or delete their own direct messages and voice
   notes. If a voice-note link expires, playback refreshes it once; unsupported
   or damaged recordings show a specific recovery message. Long-press or right-click a person or squad in the Messages list, then
   use the trash button to clear that chat from your list on this browser; a
   later message makes it appear again. The Messages menu supports marking
   messages read, creating persistent squads, and opening chat settings.
   Read notifications are cleared automatically after five minutes. Post and
   comment authors can be opened from the feed to view their profiles. Gamer
   profiles include an editable short status bubble beside the profile photo.
   Post comments open in a swipe-up bottom sheet with a fixed composer and
   threaded replies, and posts can be liked or commented on from the feed.
   Authors can delete their posts, which also removes related comments and likes
   and cleans up the uploaded media. The bucket accepts images and videos up to
   5 MB. The schema synchronizes existing and newly uploaded profile photos
   into `profiles.avatar_url`, which is used on feed posts. Settings include
   local notification filters, online visibility, appearance, help, friend
   invites, and a sign-out action. These preferences are saved in the current
   browser. Rerunning the schema backfills profile rows for accounts that
   registered before profile creation was enabled and lets the friend finder
   search gamers who have signed in at least once, including gamers who are
   currently offline. Selecting a gamer from search opens a direct conversation.
   Gamer profiles support an owner-uploaded cover image stored in
   `profiles.background_image_url`.
   The latest schema adds the `profiles.profile_status` field used by profile
   status bubbles, daily login-streak tracking, read-message tracking and
   cleanup functions, persistent group-chat tables and policies, message reply
   references and private voice-note storage. Conversation clears are saved
   locally in this browser. The schema also ensures the group-message reply foreign key exists, allows
   senders to delete their own group messages, and reloads the
   PostgREST schema cache. Login streaks increase once per
   calendar day and reset after a missed day. Rerun the schema after app updates
   that add Supabase functions or profile fields.
   Existing projects must rerun this schema to add the follow, notifications,
   comments, and private messaging features, post media/comment-count columns,
   and update bucket settings. If you only need to update Storage, run
   `supabase-storage-policies.sql`; it updates the existing bucket settings and
   owner-scoped upload, update, and delete policies.
   To enable post deletion without rerunning the full schema, run
   `supabase-post-delete.sql` in the Supabase SQL Editor.
   To enable gamer search, private messages, group chats, message replies,
   voice notes, and notification cleanup, run the complete latest
   `supabase-schema.sql` in the Supabase SQL Editor and then reload the app.
   This schema adds private image/video message attachments, group message
   reactions, and message retention. Message attachments are compressed in the
   browser before sending. Images are resized and converted to WebP; videos up
   to two minutes are re-encoded at a lower bitrate. Compressed attachments
   must be 20 MB or smaller.
   Messages are deleted from the database after 30 days, and read notifications
   after five minutes. The schema attempts to schedule cleanup through
   `pg_cron`. If the SQL Editor reports that pg_cron is unavailable, schedule
   `select public.cleanup_expired_messages();` to run every minute in Supabase.
   To repair a group-message reply relationship error on an existing project,
   run `supabase-group-reply-fix.sql` in the Supabase SQL Editor, then reload
   the app.
   If profile-background uploads report that `background_image_url` is missing,
   run the latest `supabase-profile-background-fix.sql` in the SQL Editor for
   this same Supabase project, wait for the schema cache to refresh, then reload
   the app. The migration grants the column update and configures the owner
   profile row and Storage policies needed to upload and clean up covers.
   Applying the latest full schema also adds this profile column.
   To enable replies to post comments on an existing project, run
   `supabase-comment-replies-fix.sql` after the comments table exists. Confirm
   its final verification query returns `parent_comment_id`, wait for the
   Supabase schema cache to refresh, then reload the app. The latest full schema
   includes this migration.
   If group messages report that `group_messages.media_path` does not exist,
   run `supabase-group-message-media-fix.sql` in the SQL Editor and reload the
   app. Applying the latest full schema also adds the required columns.
   New accounts receive an optional app-install prompt. The prompt is stored
   as a notification and removed five minutes after it is read. The app is
   installable from supported browsers; the PWA splash background is black.
   Apply the latest schema to enable the install prompt.
   Group creators can set the group picture by clicking the group profile
   picture in the chat header. The
   schema restricts group-picture changes and uploads to each group’s creator;
   apply the latest `supabase-schema.sql` for this feature to work.
   Voice notes require microphone permission and a secure site (HTTPS, such as
   the Netlify deployment); the composer switches between a circular microphone
   and send button, and press-and-hold the microphone then swipe left to lock
   recording at a reduced audio bitrate. Recipients see a recording indicator.
   Preview, send, or discard
   before sending; long-press a sent message to react, reply, or delete your
   own message. Voice notes can also be sent as replies.
   Voice playback uses private, conversation-member access policies. Gamer search
   results open a conversation when selected; they do not send friend requests.
   To check that its gamer-search function exists, run
   `select to_regprocedure('public.search_gamers(text)');` and confirm it
   returns `search_gamers(text)`.
2. Notifications cover sign-ins, new member joins, post likes, comments,
   follows, friend requests, accepted requests, and incoming private messages.
   Notifications, friend requests, incoming private messages, and online gamer
   presence use Supabase Realtime; the app also refreshes notification counts
   periodically. Read notifications are cleared after five minutes. Comments,
   follows, friend requests, messages, group chats, and notifications require
   the updated schema to be applied in the Supabase SQL Editor.
3. To enable both Google sign-up and sign-in:
   - In Supabase Authentication > URL Configuration, set the local Site URL to
     `http://127.0.0.1:8000` and add `http://127.0.0.1:8000/**` to Redirect URLs.
   - In Authentication > Providers, enable Google and enter the OAuth client ID
     and secret from your Google Cloud OAuth client.
   - In Google Cloud, add Supabase's callback URL shown on the Google provider
     settings page (usually `https://<project-ref>.supabase.co/auth/v1/callback`)
     to the OAuth client's authorized redirect URIs.
   - For a deployed site, also add its origin and `https://your-domain/**` to
     Supabase Redirect URLs, and use that site's callback URL in Google Cloud.
4. Double-click `start-app.bat`. It starts a local web server and opens the
   login page. Keep the server window open while using the app.
5. The gaming news feed is loaded by the Netlify function
   `netlify/functions/gaming-news.js`. It uses Google News RSS if no GNews API
   key is configured; optionally add `GNEWS_API_KEY` to the site's environment
   variables to use GNews as the preferred source. The key is used only by the
   function and must not be placed in browser code. The function filters out
   stories that do not match gaming topics, extracts available RSS images, and
   prefers RSS results when they provide more images than GNews. Some publishers
   block external image loading, so individual images may still be unavailable.
   Redeploy after changing function code or environment variables. Rotate any
   GNews key previously used in browser code before deploying, since it was
   publicly exposed.

## Message banners and phone notifications

Incoming direct messages use Supabase Realtime to show a short in-app banner
with the sender's profile picture, name, and message preview. To receive
operating-system notifications while Gamer Studio is in the background or
closed, configure Web Push:

1. Run `supabase-push-notifications.sql` in the Supabase SQL Editor. It creates
   the private, per-user table that stores browser push subscriptions.
2. Install the server dependency with `npm install`.
3. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. In the
   Netlify site environment, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
   from that output, `VAPID_SUBJECT` to a contact such as `mailto:you@example.com`,
   `SUPABASE_URL` to this Supabase project's URL, and
   `SUPABASE_SERVICE_ROLE_KEY` to its server-only service-role key. Also set
   `PUSH_WEBHOOK_SECRET` to a strong random secret generated locally. Never
   put the private VAPID key, webhook secret, or service-role key in browser
   code, SQL checked into the repository, or a public chat.
4. In Supabase Database Webhooks, create an HTTP `POST` webhook for
   `public.direct_messages` on `INSERT`. Point it to
   `https://<your-netlify-site>/.netlify/functions/push-messages` and add the
   header `x-gamer-studio-secret` with the same value as `PUSH_WEBHOOK_SECRET`.
5. Deploy the site, then open **Settings → Phone notifications → Enable** on
   each device and allow the browser's notification permission. The app must
   be served over HTTPS. On iPhone and iPad, add the site to the Home Screen
   first; Web Push requires an installed web app there.

The Netlify push function sends the sender name and message preview and uses
the Gamer Studio mark as the system notification icon. Tapping the phone
notification opens that sender's chat. Users can turn off phone notifications
for a device from the same Settings control. The existing Message notifications
setting controls in-app message alerts and banners.

The browser app uses a Supabase publishable key. Never put a secret or
service-role key in client-side files. Existing Firebase Auth accounts and
Firestore data are not automatically transferred; migrate them separately
before removing the Firebase project.
