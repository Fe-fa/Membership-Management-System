# ACEA Membership Gateway

generate a membership application dashboard which will have Prompt: Build Multistep Membership Application Form (ACEA Dashboard)
Context

I'm building a member dashboard for the Aero Club of East Africa (ACEA). Once an applicant logs into their dashboard, they should see a "Membership Application Form" flow, broken into logical steps (a wizard/multistep form), matching the attached official PDF ("ACEA Membership Application Form 2025"). Please review my current implementation, check that the database schema, backend API, and frontend are all properly wired together, fix any mismatches, and make sure the whole flow works end-to-end (validation, submission, persistence, and status tracking).

Required Steps (map directly to the PDF)

Step 1 — Applicant Personal Details

First Name, Middle Name, Last Name
Postal Address, City, State/Country, Postal/ZIP Code, Country
Email, Alt. Email
Mobile (with intl prefix), Tel. Other
ID/Passport No., Nationality
Date of Birth, Place of Birth, Country of Residence
Occupation, Company, Role
Blood Group, Gender
Photo upload (passport-size)
CV upload (attachment)

Step 2 — Marital & Family Status

Marital status (Married: Yes/No)
If married: Spouse name, spouse phone, spouse email
Children (Yes/No); if yes, repeatable list of {name, date of birth} for children under 18
Emergency contact: name, phone, email

Step 3 — Aviation Affiliation

Affiliated with aviation (Yes/No) + role if yes
Holds pilot's license (Yes/No); if yes: License Type, License Number, Issuer + license file upload
Owns/co-owns aircraft (Yes/No); if yes: Type of Aircraft, Registration Number, Hangar Location

Step 4 — Membership Type & Fees

Election type: Full / Country / Overseas (single select)
Display fee table dynamically based on selection:
Full: Joining KES 250,000 (under 30: 125,000) / Annual Subs KES 39,500
Country: Joining KES 250,000 (under 30: 125,000) / Annual Subs KES 31,200
Overseas: Joining KES 250,000 (under 30: 125,000) / Annual Subs KES 20,300
Applicant signature (typed name or e-signature pad)

Step 5 — Proposer & Seconder

Two separate sub-sections (Proposer, Seconder), each requiring:
Name of candidate proposed/seconded, membership type applied for
Years known
Personal knowledge statement (textarea)
Professional knowledge statement (textarea)
Why the applicant adds value (textarea)
Proposer/Seconder's own name, phone, email, year of joining, signature, date
Note: system should flag/validate that proposer & seconder have been members ≥ 3 years (pull from members DB if available)

Step 6 — Other Club Memberships

Member of another club (Yes/No)
If yes: repeatable list of club names (up to 3)

Step 7 — Data Consent & Declaration

Display privacy policy summary (data collected, purpose, no transfer outside Kenya, sharing with AMREF Flying Doctors + reciprocating clubs, security measures, user rights, contact: membershipdesk@aeroclubea.com)
Checkbox: "I agree to adhere to the Members Privacy Policy"
Declaration checkbox: "I confirm the information provided is accurate and I agree to abide by the rules, regulations and constitution of the Club"
Final applicant name, signature, date

Step 8 — Review & Submit

Read-only summary of all entered data across steps, with "Edit" links back to each step
Submit button → sends to backend, generates application record.  i will still connect with other part but let start with this one .update fronted react+typescript .backend will be c# with EF. ENSURE REACT IS WELL OPTIMIZED. UPDATE

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b2e9d15c-e8cc-4f1b-9ff1-14bdde6b67a8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
