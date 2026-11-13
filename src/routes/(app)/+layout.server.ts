import { requireUser } from '#lib/server/guard';
import type { LayoutServerLoad } from './$types';

// The one gate for every page in this group: no login, no page. Queries and forms check again for themselves.
export const load: LayoutServerLoad = ({ locals }) => ({ user: requireUser(locals) });
