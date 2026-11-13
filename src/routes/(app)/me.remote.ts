import { query } from '$app/server';
import { auth, screens } from '#lib/server/app';
import { currentUser } from '#lib/server/guard';

/** How many requests wait for this person's decision. Employees never decide, so 0. */
export const getOpenApprovals = query(async () => {
	const user = currentUser();
	return user.role === 'employee' ? 0 : screens.pending(user).open.length;
});

/** The name of the person's team lead, for the profile and the request screens. */
export const getManagerName = query(async () => {
	const user = currentUser();
	return user.managerId ? auth.getUser(user.managerId)?.name : undefined;
});
