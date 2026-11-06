// The four roles, shared by the server and the browser.
//
// The server decides what each role may do. The browser only uses this list to
// choose which menu items and labels to show.
export const ROLES = {
  admin: { label: 'Admin', about: 'Everything, plus giving roles and suspending accounts' },
  staff: { label: 'Staff', about: 'Every client, the activity log and branding' },
  client: { label: 'Client', about: "One company's projects, files and invoices" },
  customer: { label: 'Customer', about: 'Signed up, waiting for an admin to give access' },
};

export const ROLE_NAMES = Object.keys(ROLES);

// The agency's own people: they see every client.
export function isTeam(role) {
  return role === 'admin' || role === 'staff';
}
