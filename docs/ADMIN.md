# Setting up the admin area

The admin area is optional. It lets a Data Owner set up aircraft and publish Data Releases in the browser, with no JSON. Pilots never sign in. Without it, you can publish hand-written files with the command-line tool. See [FORMAT.md](FORMAT.md).

> **Keep your data private.** Don't commit real manual tables or weighing data to a public repository. Anyone with your app's address can download what you publish, because pilots need no login.

## 1. Connect file storage

In Vercel, open your project, then **Storage**, create a **Blob** store with **Private** access, and connect it to the project. Check that plan's limits and terms for your use. Vercel's Hobby plan is limited to non-commercial, personal use.

## 2. Create a Google sign-in

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project.
2. Set up the **OAuth consent screen** as **External**, with only the basic email and profile scopes, then publish it.
3. Under **Credentials**, create an **OAuth client ID** of type **Web application**.
4. Add this **Authorized redirect URI**, using your own address: `https://your-site.example/api/auth/callback/google`

## 3. Add the settings

Add these in your host's environment variables, then redeploy:

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | From step 2 |
| `GOOGLE_CLIENT_SECRET` | From step 2 |
| `BETTER_AUTH_SECRET` | A long random text, such as the output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Your site's address, such as `https://your-site.example` |
| `ADMIN_EMAILS` | The Google addresses allowed in, separated by commas |

Then open `/admin` and sign in.

## Managing admins

- **To remove an admin,** delete their address from `ADMIN_EMAILS` and redeploy. They lose access on their next request.
- **To sign everyone out,** change `BETTER_AUTH_SECRET` and redeploy.
- Sessions last 8 hours.

## Publishing

1. Add an aircraft, then fill in each section, entering tables exactly as printed in the manual.
2. Add hand-calculated cases, worked out by a person.
3. For a real aircraft, type every table again under **Second entry**, ideally by a second person.
4. Open **Check**, and fix anything listed.
5. Back on the list, choose **Publish new release**.

Publishing has no override. Releases are permanent: to undo one, restore the earlier version as a draft and publish it under a new number. Pilots see a new release as a notice, and install it when they choose. A withdrawn aircraft is blocked as soon as a device sees the notice, but a device that stays offline can't learn this.

## Keeping up to date

Your copy doesn't update itself. The admin area shows a notice when a newer version exists. To update, pull the changes into your copy and redeploy. We recommend turning on Dependabot alerts on your copy, because security fixes can be urgent.
