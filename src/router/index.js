import substanceHistory from '../../data/substance-history.json'
import aliases from '../../data/route-aliases.json'

export const routes = [
  ...Object.entries(substanceHistory).filter(([, h]) => h.status === 'redirect').map(([slug, h]) => ({ path: `/substance/${slug}`, redirect: `/substance/${h.target}` })),
  ...Object.entries(aliases.routes).map(([path, redirect]) => ({ path, redirect })),
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
    path: '/substance/:slug',
    name: 'substance',
    component: () => import('../views/SubstanceView.vue'),
    meta: {
      title: 'Substance'
    }
  },
  {
    path: '/api',
    name: 'api',
    component: () => import('../views/ApiDocsView.vue'),
    meta: {
      title: 'API Documentation'
    }
  },
  {
    path: '/ontology',
    name: 'ontology',
    component: () => import('../views/OntologyBrowserView.vue'),
    meta: {
      title: 'Ontology Browser'
    }
  }
]
