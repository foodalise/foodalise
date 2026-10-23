// Foodalise's legal pages, in plain words: shown in the app (app/privacy.tsx,
// app/terms.tsx, app/reviews-policy.tsx) and on foodalise.com, which
// scripts/build-website.mjs makes from this file. After changing anything here,
// run `node scripts/build-website.mjs` so the website matches the app.
// No imports: the website script reads this file on its own.

// How people reach the Foodalise team about their data or a post. Also the
// support email for the App Store.
export const CONTACT_EMAIL = 'foodalise.app@gmail.com';
// Who runs Foodalise, named in the privacy policy, the terms and the website footer.
// UK law asks for the company's number and registered office wherever it is named.
export const OPERATOR = 'Foodalise Ltd';
export const COMPANY_NUMBER = '17538657';
export const REGISTERED_OFFICE = '167-169 Great Portland Street, London, W1W 5PF';
export const COMPANY_DETAILS = `${OPERATOR} is a company registered in England and Wales (company number ${COMPANY_NUMBER}). Registered office: ${REGISTERED_OFFICE}.`;

export type LegalPage = { title: string; updated: string; sections: [string, string][]; footer: string };

export const PRIVACY: LegalPage = {
  title: 'Privacy policy',
  updated: '23 October 2026',
  sections: [
    ['Who we are', `Foodalise is an app for photographing, scoring and sharing the dishes you eat at restaurants in the UK. It is run by ${OPERATOR} (company number ${COMPANY_NUMBER}, registered office ${REGISTERED_OFFICE}), which is responsible for your data (the "data controller"). Contact: ${CONTACT_EMAIL}.`],
    ['What we collect', 'Your email address and password (to sign you in), your username, name, profile photo, bio and favourite cuisines, and what you post: reviews, scores, dish photos, menu photos, comments, yums (likes), who you follow, dishes and restaurants you save, and any posts or people you report or block. If you allow notifications, we keep a code for your phone so we can send them. We also note when you last used the app and how many times you have used it. Like any online service, our servers keep short-lived technical logs (such as your IP address and the type of phone) for security and to fix problems.'],
    ['Why we use it', "To run the app for you, as our agreement with you (the Terms of Use). We also use reports, blocks, a filter for offensive words and posting limits to keep Foodalise safe and stop fake reviews, and count how often people use the app so we can see how Foodalise is doing and improve it (only the Foodalise team sees this), which is in everyone's legitimate interest. Notifications are sent only if you allow them, and you can turn them off at any time in your phone's settings. We do not sell your data, show you adverts, use it to train AI, or make automated decisions about you that have legal or similar effects."],
    ['What is public', 'Your username, name, profile photo, bio, reviews, scores, dish photos, comments, your Want to try list and who you follow can be seen by anyone using Foodalise. Your email address is never shown.'],
    ['Your location', "With your permission, your phone's location is used to show restaurants and dishes near you. It is sent to our database only to find what's nearby and is never stored. You can turn location off at any time in your phone's settings."],
    ['Who else handles your data', "Supabase stores everything on servers in London. Expo (in the US) delivers notifications to your phone. Google's Gmail sends password reset emails. When you snap a menu, the photo goes to Anthropic's Claude AI (in the US) to read the dish names; Anthropic does not use it to train its AI. Restaurant names and addresses (never your details) are used to find restaurant websites through OpenStreetMap, Google and Claude's web search, and Jina Reader helps load those websites. When you search the map for an area or postcode, just the words you type go to postcodes.io to find it. Each of these companies only uses your data to provide their service to us. Services outside the UK are covered by the UK's approved data transfer safeguards."],
    ['How long we keep it', 'Your account, posts and usage counts are kept until you delete them or your account. Notification codes are deleted with your account, or replaced when someone else signs in on that phone. Reports are kept while they are needed to keep the app safe. Technical logs are deleted automatically within a few days, and deleted data can stay in our hosting backups for up to 7 days.'],
    ['Deleting your data', 'You can delete any review from your profile. To delete everything, go to You > Delete my account. Your account, reviews and photos are then removed for good.'],
    ['Your rights', `You can ask for a copy of your data (in a common format you can take elsewhere), ask us to correct or delete it, ask us to stop or limit using it, or object to how we use it. Email ${CONTACT_EMAIL} and we will reply within a month. If you are unhappy with how we handle your data, tell us first and we will look into it; you can also complain to the Information Commissioner's Office at ico.org.uk.`],
    ['Age', 'You need to be 18 or older to use Foodalise. If we find out that someone under 18 has an account, we will delete it.'],
    ['Reporting', "If a review, comment, photo or profile is offensive, illegal or looks fake, tap ⋯ on it, or Report on someone's profile, and you can block the person too. We check reports and remove content that breaks the rules."],
    ['Changes', 'If we change this policy in an important way, we will tell you in the app. The date at the top shows when it last changed.'],
  ],
  footer: `Questions or requests about your data: ${CONTACT_EMAIL}`,
};

// The rules for using Foodalise. Agreed to when creating an account.
export const TERMS: LegalPage = {
  title: 'Terms of Use',
  updated: '23 October 2026',
  sections: [
    ['Who we are', `Foodalise is run by ${OPERATOR} ("we"). ${COMPANY_DETAILS}`],
    ['Using Foodalise', 'Foodalise lets you photograph, score and share the dishes you eat at restaurants. You need to be 18 or older to make an account. Keep your password safe; you are responsible for what is posted from your account.'],
    ['Your posts', 'You own the photos, scores and reviews you post, and you are responsible for them. By posting them you let Foodalise store, show and share them in the app, and use them to promote Foodalise, without paying you. This stops when you delete the post or your account, apart from copies other people already shared or short-lived backups.'],
    ['Be fair and honest', "Only review dishes you actually ate, and give your honest opinion. Don't post fake reviews, including reviews of your own restaurant or a rival's. Opinions are fine, but don't state things as facts that aren't true (for example, that a restaurant made you ill when it didn't). Only post photos you took or have permission to use. If you got the dish free or were paid, say so in your review. Our Reviews policy (in Settings) has the details."],
    ['Not allowed', "Nothing illegal, including anything to do with child sexual abuse, terrorism, fraud, or selling drugs, weapons or other illegal items. Nothing offensive, hateful, sexual or violent. No harassing or threatening anyone, no pretending to be someone else, no sharing other people's personal details, no photos of other people without their permission, no spam or adverts, and no photos that aren't about food or the restaurant."],
    ['How we keep Foodalise safe', "We don't allow illegal or harmful content. We block offensive words, limit how much anyone can post, and let you report any review, comment or profile and block any person. Our team checks every report, aiming to do so within 2 working days, and removes content that breaks these terms. We may remove posts, reset profiles, or suspend or close accounts that break them, without warning if needed, and we report content to the police or other authorities when the law requires it. We apply these rules in the same way to everyone."],
    ['Complaints and appeals', `Email ${CONTACT_EMAIL} if you want to complain about a post, a profile or how we handled a report, or if we removed your post or closed your account and you think we got it wrong. Tell us what it is about and why, and we will look at it again and reply. Restaurants and anyone else, including people without an account, can use the same email to tell us that a review is untrue or unlawful: say which review, what is wrong with it, and how to contact you, and we will look into it and act as the law requires.`],
    ['Menus and restaurant details', 'Menus, prices and diet labels are collected from restaurant websites, menu photos and diners, and restaurant details come from public records. They can be wrong or out of date, so check prices with the restaurant. Never rely on Foodalise for allergy or dietary information: always ask the restaurant.'],
    ['Ending your account', 'You can stop using Foodalise and delete your account at any time from You > Delete my account. We may close accounts that break these terms, and may stop running Foodalise; if we do, we will try to tell you first.'],
    ['Our responsibility', "We work to keep Foodalise running and accurate, but it is a free service provided as it is, and we can't promise it will always be available or error free. As far as the law allows, we aren't responsible for losses from using it. Nothing in these terms limits our responsibility for death or personal injury caused by our negligence, for fraud, or for anything else the law does not let us limit, and nothing here affects your legal rights as a consumer."],
    ['Changes', 'We may update these terms. If the changes are important, we will tell you in the app. Carrying on using Foodalise means you accept the new terms; if you don\'t, you can delete your account.'],
    ['The law', 'These terms are governed by the law of England and Wales. If you live in Scotland or Northern Ireland, you can also bring a claim in your local courts.'],
  ],
  footer: `Questions, complaints or a post to report: ${CONTACT_EMAIL}`,
};

// How Foodalise keeps reviews honest. UK law (the DMCC Act 2024) asks any app that
// shows reviews to publish a policy like this and to act on fake reviews.
export const REVIEWS_POLICY: LegalPage = {
  title: 'Reviews policy',
  updated: '23 October 2026',
  sections: [
    ['Real dishes, real opinions', 'Only review a dish you ate yourself, and say what you honestly thought. One review per dish visit.'],
    ['Not allowed', "Fake reviews of any kind: reviewing a dish you didn't eat, reviewing your own restaurant or a rival's, posting for someone else, or swapping or buying reviews. Restaurants must not offer anything in return for a review or for changing one."],
    ['Free food and gifts', 'If you were given the dish free, paid, or given anything else for your review, say so at the start of your review (for example "Free meal from the restaurant"). Reviews that hide this will be removed.'],
    ['What we never do', "We don't pay for reviews, sell positive reviews, or hide bad ones. Restaurants can't remove or edit reviews they don't like, and nobody can pay to change a score or where a review appears. Scores are worked out from every review that follows these rules."],
    ['How we check', 'Each person can post up to 20 reviews a day and review the same dish once a day. Anyone can report a review as "Looks fake or paid for" from the ⋯ menu. Our team checks every report.'],
    ['What happens to fake reviews', "We remove them, which also takes them out of the dish's score. People who post them can lose their account, and restaurants involved may be marked or removed."],
    ['For restaurants', `If you think a review of your restaurant is fake or untrue, email ${CONTACT_EMAIL} with the review and why. We will check it against this policy and remove it if it breaks the rules. We won't remove honest reviews just because they are negative.`],
  ],
  footer: `Spotted something suspicious? Email ${CONTACT_EMAIL}`,
};
