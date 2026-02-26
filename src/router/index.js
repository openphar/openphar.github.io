export const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: {
      title: 'Open Pharmacopoeia',
      description: 'Unified knowledge graph for pharmacopoeia standards'
    }
  },
  {
    path: '/pharmacopoeia/:publisher',
    name: 'pharmacopoeia',
    component: () => import('../views/PharmacopoeiaView.vue'),
    meta: {
      title: 'Pharmacopoeia'
    }
  },
  {
    path: '/pharmacopoeia/:publisher/:category/:slug',
    name: 'monograph',
    component: () => import('../views/MonographDetailView.vue'),
    meta: {
      title: 'Monograph'
    }
  },
  {
    path: '/search',
    name: 'search',
    component: () => import('../views/SearchView.vue'),
    meta: {
      title: 'Search'
    }
  },
  {
    path: '/compare',
    name: 'compare',
    component: () => import('../views/CompareView.vue'),
    meta: {
      title: 'Compare Monographs'
    }
  },
  {
    path: '/api',
    name: 'api',
    component: () => import('../views/ApiDocsView.vue'),
    meta: {
      title: 'API Documentation'
    }
  }
]
