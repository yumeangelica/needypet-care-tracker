/**
 * Route middleware for pages that require a signed-in user.
 * Applied per-page via definePageMeta({ middleware: 'auth' }).
 */
export default defineNuxtRouteMiddleware(() => {
  const { loggedIn } = useUserSession();
  if (!loggedIn.value) {
    return navigateTo('/');
  }
});
