import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Someone who is logged in has no business here.
export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(303, '/');
};
