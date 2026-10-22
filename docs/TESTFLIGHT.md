# Putting Foodalise on TestFlight

TestFlight lets up to 100 people (you and friends) install Foodalise as a real
iPhone app, with its own icon, without Expo Go. Builds run on Expo's servers
(free plan), so you don't need Xcode.

## One-off setup

1. **Apple Developer account** (£79 a year): enrol at https://developer.apple.com/programs/enroll/
   using your Apple ID. Approval can take a day or two.
2. **Install Expo's build tool** on your Mac. In Terminal:
   `npm install -g eas-cli`
3. **Sign in to Expo** (the same account you use in Expo Go):
   `eas login`
4. **Link the project.** In Terminal, `cd` into the foodalise-main folder, then run:
   `eas init`
   Say yes to creating a project. It prints a **project ID** (a long code with dashes).
   Send that ID to Claude so it can be saved into the app for good; it also switches on
   lock-screen notifications.

## Each time you want a new test version

1. Download the latest main zip, unzip, `cd` into it, `npm install`.
2. Build:
   `eas build --platform ios --profile production`
   The first time, it asks to sign in to your Apple account and offers to create the
   certificates for you: say yes to everything. The build takes about 15–30 minutes.
3. Send it to Apple:
   `eas submit --platform ios --latest`
   The first time, it creates the app in App Store Connect for you.
4. After Apple processes it (about 10–30 minutes), go to https://appstoreconnect.apple.com,
   open Foodalise, then **TestFlight**. Add yourself and friends under **Internal Testing**
   (people on your team) or **External Testing** (anyone by email; Apple reviews the first
   build, usually within a day).
5. Testers install the **TestFlight** app from the App Store and accept the invite.
