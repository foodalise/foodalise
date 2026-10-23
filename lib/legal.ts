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
    ['What we collect', 'Your email address and password (to sign you in), your username, profile photo, bio and favourite cuisines, and what you post: reviews, scores, dish photos, menu photos, comments, yums (likes), who you follow, dishes and restaurants you save, and any posts you report or people you block. If you allow notifications, we keep a code for your phone so we can send them.'],
    ['Why we use it', 'To run the app for you, as our agreement with you (the Terms of Use). We also use reports, blocks and posting limits to keep Foodalise safe and stop fake reviews, which is in everyone\'s legitimate interest. We do not sell your data, show you adverts or use it to train AI.'],
    ['What is public', 'Your username, profile photo, bio, reviews, scores, dish photos, comments, your Want to try list and who you follow can be seen by anyone using Foodalise. Your email address is never shown.'],
    ['Your location', 'With your permission, your phone\'s location is used to show restaurants and dishes near you. It is sent to our database only to find what\'s nearby and is never stored.'],
    ['Who else handles your data', "Supabase stores everything on servers in London. Expo (in the US) delivers notifications to your phone. Google's Gmail sends password reset emails. When you snap a menu, the photo goes to Anthropic's Claude AI (in the US) to read the dish names. Restaurant names and addresses (never your details) are used to find restaurant websites through OpenStreetMap and Google, and Jina Reader helps load those websites. When you search the map for an area or postcode, just the words you type go to postcodes.io to find it. Services outside the UK are covered by the UK's approved data transfer safeguards."],
    ['How long we keep it', 'Your account and posts are kept until you delete them. Notification codes are deleted with your account, or replaced when someone else signs in on that phone. Reports are kept while they are needed to keep the app safe.'],
    ['Deleting your data', 'You can delete any review from your profile. To delete everything, go to You > Delete my account. Your account, reviews and photos are then removed for good.'],
    ['Your rights', `You can ask for a copy of your data, ask us to correct or delete it, or object to how we use it. Email ${CONTACT_EMAIL} and we will reply within a month. If you are unhappy with how we handle your data, you can complain to the Information Commissioner's Office at ico.org.uk.`],
    ['Age', 'You need to be 13 or older to use Foodalise.'],
    ['Reporting', 'If a review or photo is offensive or looks fake, tap ⋯ on it to report it or block the person. We check reports and remove content that breaks the rules.'],
  ],
  footer: `Questions or requests about your data: ${CONTACT_EMAIL}`,
};

// The rules for using Foodalise. Agreed to when creating an account.
export const TERMS: LegalPage = {
  title: 'Terms of Use',
  updated: '23 October 2026',
  sections: [
    ['Who we are', `Foodalise is run by ${OPERATOR} ("we"). ${COMPANY_DETAILS}`],
    ['Using Foodalise', 'Foodalise lets you photograph, score and share the dishes you eat at restaurants. You need to be 13 or older to make an account. Keep your password safe; you are responsible for what is posted from your account.'],
    ['Your posts', 'You own the photos, scores and reviews you post. By posting them you let Foodalise store, show and share them in the app, and use them to promote Foodalise, without paying you. This stops when you delete the post or your account, apart from copies other people already shared or short-lived backups.'],
    ['Be fair and honest', "Only review dishes you actually ate, and give your honest opinion. Don't post fake reviews, including reviews of your own restaurant or a rival's. Only post photos you took or have permission to use. If you got the dish free or were paid, say so in your review. Our Reviews policy (in Settings) has the details."],
    ['Not allowed', "Nothing offensive, hateful, sexual, violent or illegal. No harassing or threatening anyone, no sharing other people's personal details, no spam or adverts, and no photos that aren't about food or the restaurant."],
    ['Reports and removal', 'You can report any review or block any person. We check reports and may remove posts or close accounts that break these rules, without warning if needed.'],
    ['Menus and restaurant details', 'Menus are collected from restaurant websites, menu photos and diners, and restaurant details come from public records. They can be wrong or out of date, so check prices with the restaurant. Never rely on Foodalise for allergy or dietary information: always ask the restaurant.'],
    ['Our responsibility', "We work to keep Foodalise running and accurate, but it is provided as it is, and we can't promise it will always be available or error free. As far as the law allows, we aren't responsible for losses from using it. Nothing here affects your legal rights as a consumer."],
    ['Changes', 'We may update these terms. If the changes are important, we will tell you in the app. Carrying on using Foodalise means you accept the new terms.'],
    ['The law', 'These terms are governed by the law of England and Wales.'],
  ],
  footer: `Questions or a post to report: ${CONTACT_EMAIL}`,
};

// How Foodalise keeps reviews honest. UK law (the DMCC Act 2024) asks any app that
// shows reviews to publish a policy like this and to act on fake reviews.
export const REVIEWS_POLICY: LegalPage = {
  title: 'Reviews policy',
  updated: '22 October 2026',
  sections: [
    ['Real dishes, real opinions', 'Only review a dish you ate yourself, and say what you honestly thought. One review per dish visit.'],
    ['Not allowed', "Fake reviews of any kind: reviewing a dish you didn't eat, reviewing your own restaurant or a rival's, posting for someone else, or swapping or buying reviews. Restaurants must not offer anything in return for a review or for changing one."],
    ['Free food and gifts', 'If you were given the dish free, paid, or given anything else for your review, say so at the start of your review (for example "Free meal from the restaurant"). Reviews that hide this will be removed.'],
    ['What we never do', "We don't pay for reviews, sell positive reviews, or hide bad ones. Restaurants can't remove or edit reviews they don't like. Scores are worked out from every review that follows these rules."],
    ['How we check', 'Each person can post up to 20 reviews a day and review the same dish once a day. Anyone can report a review as "Looks fake or paid for" from the ⋯ menu. Our team checks every report.'],
    ['What happens to fake reviews', "We remove them, which also takes them out of the dish's score. People who post them can lose their account, and restaurants involved may be marked or removed."],
  ],
  footer: `Spotted something suspicious? Email ${CONTACT_EMAIL}`,
};
