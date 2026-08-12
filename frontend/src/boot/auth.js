import { defineBoot } from '#q-app/wrappers'
import UserService from '@/services/user';
import { useUserStore } from '@/stores/user'

export default defineBoot(async({ router, store, urlPath, redirect }) => {
  const userStore = useUserStore(store)
  const getCurrentPath = () => urlPath || router.currentRoute?.value?.path || ''
  
  router.beforeEach((to, from, next) => {
    if (to.path === '/login') {
        if (userStore.isLoggedIn)
          next('/')
        else
          next()
      }
      else if (to.path.startsWith('/data')) {
        // The Data section groups admin-facing screens (clients, templates, custom fields,
        // backups). Gate the whole subtree on one scope instead of each child route, so a
        // role without it can't reach them by typing the URL either.
        if (!userStore.isAllowed('data:access'))
          next('/403')
        else
          next()
      }
      else {
        next()
      }
  })

  // Launch refresh token countdown 840000=14min if not on login page
  setInterval(() => {
    UserService.refreshToken()
    .then()
    .catch(err => {
      if (!getCurrentPath().startsWith('/login'))
        if (err === 'Expired refreshToken')
          redirect('/login?tokenError=2')
        else
          redirect('/login')
    })
  }, 840000)

  // Call refreshToken when loading app and redirect to login if error
  try {
    await UserService.refreshToken()
  }
  catch(err) {
    if (!getCurrentPath().startsWith('/login'))
      if (err === 'Expired refreshToken')
        redirect('/login?tokenError=2')
      else
        redirect('/login')
  }
})
