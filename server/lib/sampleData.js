// The made-up data every visitor starts with. These companies and people are
// invented, and .example addresses can never reach a real mailbox.
//
// The password is public on purpose: it's printed on the login page.
export const SAMPLE_PASSWORD = 'demo-portal-2026';

export const DEFAULT_BRAND = { name: 'Sample Agency', color: '#14453A' };

export const PERSONAS = [
  {
    email: 'anna@alderfinch.example',
    name: 'Anna Reed',
    company: 'Alder & Finch Accountants',
    role: 'client',
    client: 'alder',
    canApprove: true,
    label: 'Client who signs off work',
  },
  {
    email: 'tom@alderfinch.example',
    name: 'Tom Hale',
    company: 'Alder & Finch Accountants',
    role: 'client',
    client: 'alder',
    canApprove: false,
    label: 'Same client, read and message only',
  },
  {
    email: 'priya@harbourlane.example',
    name: 'Priya Shah',
    company: 'Harbour Lane Dental',
    role: 'client',
    client: 'harbour',
    canApprove: true,
    label: 'A different client',
  },
  {
    email: 'sam@sampleagency.example',
    name: 'Sam Carter',
    company: 'Sample Agency',
    role: 'staff',
    canApprove: false,
    label: 'Agency staff, sees every client',
  },
  {
    email: 'lena@sampleagency.example',
    name: 'Lena Brooks',
    company: 'Sample Agency',
    role: 'admin',
    canApprove: false,
    label: 'Admin: gives roles and suspends accounts',
  },
];

const DAY = 24 * 60 * 60 * 1000;

export function sampleClients() {
  return {
    alder: {
      name: 'Alder & Finch Accountants',
      projects: [
        {
          name: 'Website rebuild',
          summary: 'New company website with service pages and a contact form.',
          dueIn: 21,
          milestones: [
            ['Sitemap and page plan', 'done', -24],
            ['Design sign-off', 'done', -10],
            ['Build and content', 'in_progress', 9],
            ['Launch', 'todo', 21],
          ],
          deliverables: [
            ['Page plan', 'Every page, and what goes on it.', 'approved', 'Anna Reed', -22],
            ['Homepage design', 'Desktop and phone versions, ready for your review.', 'pending'],
          ],
          messages: [
            ['Sam Carter', 'staff', 'The homepage design is ready for you to review. Could you look at it this week?', -2],
            ['Anna Reed', 'client', 'Thanks, I will go through it with the partners on Thursday.', -1],
          ],
          documents: [
            ['Signed project scope', 'Agreement'],
            ['Brand guidelines', 'Reference'],
          ],
          invoices: [
            ['INV-1041', 'Website rebuild, first stage', 240000, -30, -16, 'paid'],
            ['INV-1058', 'Website rebuild, second stage', 240000, -4, 10, 'unpaid'],
          ],
        },
        {
          name: 'Client onboarding forms',
          summary: 'Online forms that replace the emailed PDF pack for new clients.',
          dueIn: 45,
          milestones: [
            ['List the forms and fields', 'in_progress', 7],
            ['Build the forms', 'todo', 28],
            ['Test with two clients', 'todo', 45],
          ],
          deliverables: [],
          messages: [
            ['Sam Carter', 'staff', 'Please send the current PDF pack when you can, so I can list the fields.', -3],
          ],
          documents: [['Current onboarding pack', 'Reference']],
          invoices: [],
        },
      ],
    },
    harbour: {
      name: 'Harbour Lane Dental',
      projects: [
        {
          name: 'Patient booking portal',
          summary: 'Online booking with appointment reminders.',
          dueIn: 35,
          milestones: [
            ['Booking rules agreed', 'done', -12],
            ['Booking screens', 'in_progress', 12],
            ['Reminder emails', 'todo', 24],
            ['Launch', 'todo', 35],
          ],
          deliverables: [
            ['Booking screen designs', 'The steps a patient goes through to book.', 'pending'],
          ],
          messages: [
            ['Sam Carter', 'staff', 'The booking screens are ready for your review.', -1],
          ],
          documents: [
            ['Signed project scope', 'Agreement'],
            ['Booking rules', 'Reference'],
          ],
          invoices: [
            ['INV-1049', 'Booking portal, first stage', 310000, -18, -4, 'unpaid'],
          ],
        },
      ],
    },
  };
}

export function daysFromNow(days) {
  return new Date(Date.now() + days * DAY);
}
