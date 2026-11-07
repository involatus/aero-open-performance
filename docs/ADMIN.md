# Setting up the admin area

The admin area is optional. It lets a Data Owner set up aircraft and publish Data Releases in the browser, with no JSON. Pilots never sign in. Without it, you can publish hand-written files with the command-line tool. See [FORMAT.md](FORMAT.md).

> **Keep your data private.** Don't commit real manual tables or weighing data to a public repository. Anyone with your app's address can download what you publish, because pilots need no login.

## 1. Connect file storage

In Vercel, open your project, then **Storage**, create a **Blob** store with **Private** access, and connect it to the project. Check that plan's limits and terms for your use. Vercel's Hobby plan is limited to non-commercial, personal use.

## 2. Set an admin password

Create a long random password, for example with `openssl rand -base64 24`. In your host's environment variables, add it as `ADMIN_PASSWORD`, then redeploy. It must have at least 16 characters.

Then open `/admin`, enter your name and the password, and sign in. Your name is recorded on the drafts you change and the releases you publish.

## Managing admins

- Everyone at a club uses the same password, so the recorded name isn't proof of who made a change. Keep the password to the people who need it.
- **To remove an admin or replace a leaked password,** change `ADMIN_PASSWORD` and redeploy. This signs everyone out.
- Sessions last 8 hours.

## Publishing

1. Add an aircraft, then fill in each section, entering tables exactly as printed in the manual.
2. Add hand-calculated cases, worked out by a person.
3. For a real aircraft, type every table again under **Second entry**, ideally by a second person.
4. Open **Check**, and fix anything listed.
5. Back on the list, tick the aircraft to publish, then choose **Publish new release**. Only the ticked aircraft are checked, so an unfinished draft of another aircraft doesn't hold you up.

Aircraft you don't tick stay as pilots have them, even if you delete their draft. To take an aircraft away from pilots, withdraw it with a reason. Publishing has no override. Releases are permanent: to undo one, restore the earlier version as a draft and publish it under a new number. Pilots see a new release as a notice, and install it when they choose. A withdrawn aircraft is blocked as soon as a device sees the notice, but a device that stays offline can't learn this.

## Keeping up to date

Your copy doesn't update itself. The admin area shows a notice when a newer version exists. To update, pull the changes into your copy and redeploy. We recommend turning on Dependabot alerts on your copy, because security fixes can be urgent.
