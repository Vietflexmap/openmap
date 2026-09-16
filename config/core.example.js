/*
 * Vietflex Map Core production configuration example.
 * Copy this file into your deployment and replace endpoints with your own services.
 */
Vietflex.Core.configure({
  language: 'vi',

  search: {
    engine: 'photon',
    // Production: self-hosted Photon endpoint.
    endpoint: 'https://search.maps.example.vn'
  },

  routing: {
    engine: 'valhalla',
    // Production: self-hosted Valhalla endpoint.
    endpoint: 'https://routing.maps.example.vn',
    costing: 'auto'
  }
});

/*
Recommended DNS separation:

maps.example.vn       -> styles / PMTiles / fonts / sprites
search.maps.example.vn -> Places/Photon
routing.maps.example.vn -> Valhalla route/matrix/map-matching
api.maps.example.vn    -> future unified Vietflex gateway
*/
