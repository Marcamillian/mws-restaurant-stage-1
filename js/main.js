let restaurants,
  neighborhoods,
  cuisines
var map
var markers = []
let dbHelper = new DBHelper();

/**
 * Fetch neighborhoods and cuisines as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {
  
  // START -- Detect offline - Sourced from - https://developer.mozilla.org/en-US/docs/Web/API/NavigatorOnLine/Online_and_offline_events
  let updateOnlineStatus = (event)=>{
    var condition = navigator.onLine ? "online" : "offline";
    console.log(`App is now ${condition}`)
    // TODO: Do something user facing when app goes on/offline
    if(condition == "online"){ // send the offline requests if we have come online
      dbHelper.sendPendingRequests()
    }
  }
  updateOnlineStatus()
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus)
  /* END -- Detect offline */

  dbHelper.populateOfflineDatabase()
  .then(()=>{ // fill with network fresh data
    return Promise.all([
      dbHelper.getCuisines().then(fillCuisinesHTML),
      dbHelper.getNeighborhoods().then(fillNeighborhoodsHTML)
    ])})
  .then(generateMap)
  .then(updateRestaurants)  // fill with the locally stored
  .catch((err)=>{
    console.log(`Couldn't populate the database || ${err}`)
    return Promise.all([
      dbHelper.getCuisines().then(fillCuisinesHTML),
      dbHelper.getNeighborhoods().then(fillNeighborhoodsHTML)
    ]).then(updateRestaurants)
  })

});

/**
 * Fetch all neighborhoods and set their HTML.
 */
fetchNeighborhoods = () => {
  DBHelper.fetchNeighborhoods((error, neighborhoods) => {
    if (error) { // Got an error
      console.error(error);
    } else {
      self.neighborhoods = neighborhoods;
      fillNeighborhoodsHTML();
    }
  });
}

/**
 * Set neighborhoods HTML.
 */
fillNeighborhoodsHTML = (neighborhoods = self.neighborhoods) => {
  const select = document.getElementById('neighborhoods-select');
  neighborhoods.forEach(neighborhood => {
    const option = document.createElement('option');
    option.innerHTML = neighborhood;
    option.value = neighborhood;
    select.append(option);
  });
}

/**
 * Fetch all cuisines and set their HTML.
 */
fetchCuisines = () => {
  DBHelper.fetchCuisines((error, cuisines) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.cuisines = cuisines;
      fillCuisinesHTML();
    }
  });
}

/**
 * Set cuisines HTML.
 */
fillCuisinesHTML = (cuisines = self.cuisines) => {
  const select = document.getElementById('cuisines-select');

  cuisines.forEach(cuisine => {
    const option = document.createElement('option');
    option.innerHTML = cuisine;
    option.value = cuisine;
    select.append(option);
  });
}

/**
 * Update page and map for current restaurants.
 */
updateRestaurants = () => {
  const cSelect = document.getElementById('cuisines-select');
  const nSelect = document.getElementById('neighborhoods-select');

  const cIndex = cSelect.selectedIndex;
  const nIndex = nSelect.selectedIndex;

  const cuisine = (cSelect[cIndex].value == "all") ? undefined : cSelect[cIndex].value;
  const neighborhood = (nSelect[nIndex].value == "all") ? undefined : nSelect[nIndex].value;

  
  dbHelper.getRestaurantsByCuisineAndNeighborhood(cuisine, neighborhood)
    .then(resetRestaurants)
    .then(fillRestaurantsHTML)
    .then(listenLazyLoad)
    .catch( err => console.error(err) )
  
}

/**
 * Clear current restaurants, their HTML and remove their map markers.
 */
resetRestaurants = (restaurants) => {
  // Remove all restaurants
  self.restaurants = [];
  const ul = document.getElementById('restaurants-list');
  ul.innerHTML = '';

  // Remove all map markers
  self.markers.forEach(m => m.setMap(null));
  self.markers = [];
  self.restaurants = restaurants;
}

/**
 * Create all restaurants HTML and add them to the webpage.
 */
fillRestaurantsHTML = (restaurants = self.restaurants) => {
  const ul = document.getElementById('restaurants-list');
  restaurants.forEach(restaurant => {
    ul.append(createRestaurantHTML(restaurant));
  });
  addMarkersToMap();
}

/**
 * Create restaurant HTML.
 */
createRestaurantHTML = (restaurant) => {

  const li = document.createElement('li');

  const imageContainer = document.createElement('div');
  imageContainer.classList.add('image-container');

  const image = document.createElement('img');
  image.classList.add('restaurant-img');

  // decompose the url to allow selection of different images
  // in response to the image display size
  const baseURL = DBHelper.imageUrlForRestaurant(restaurant);
  let urlComponents = baseURL.split(".");

  image.lazySrc = `${urlComponents[0]}-400_1x.${urlComponents[1] || 'jpg' }`; // src for fallback
  image.lazySrcset = `${urlComponents[0]}-400_1x.${ urlComponents[1] || 'jpg' } 1x,
                  ${urlComponents[0]}-800_2x.${ urlComponents[1] || 'jpg' } 2x`;

  image.alt = DBHelper.imageAltTextForRestaurant(restaurant);
  imageContainer.append(image);

  // add favorite icon
  const favButton = document.createElement('button');
  favButton.classList.add('fav-button');
  if(restaurant.is_favorite == "true"){ favButton.classList.add('fav') };
  favButton.addEventListener('click', ()=>{
    dbHelper.toggleAsFavorite(restaurant.id)
    .then(()=>{
      favButton.classList.toggle('fav')
      const isFav = favButton.classList.contains('fav')
      const labelText = (isFav)
        ? `Remove ${restaurant.name} from favorites`
        : `Add ${restaurant.name} to favorites`
      favButton.setAttribute('aria-label', labelText)
    })
  })
  const labelText = (restaurant.is_favorite == "true")
    ? `Remove ${restaurant.name} from favorites`
    : `Add ${restaurant.name} to favorites`
  favButton.setAttribute(`aria-label`, labelText)
  imageContainer.append(favButton)

  li.append(imageContainer)

  const name = document.createElement('h1');
  name.innerHTML = restaurant.name;
  li.append(name);

  const neighborhood = document.createElement('p');
  neighborhood.innerHTML = restaurant.neighborhood;
  li.append(neighborhood);

  const address = document.createElement('p');
  address.innerHTML = restaurant.address;
  li.append(address);

  const more = document.createElement('a');
  more.innerHTML = 'View Details';
  more.href = DBHelper.urlForRestaurant(restaurant);
  more.id = restaurant.name;

  more.setAttribute('aria-label', `${restaurant.name}: ${restaurant.cuisine_type} cuisine in ${restaurant.neighborhood} , View Details`);

  li.append(more);

  return li
}

/**
 * Add markers for current restaurants to the map.
 */
addMarkersToMap = (restaurants = self.restaurants) => {
  restaurants.forEach(restaurant => {
    // Add marker to the map
    const marker = DBHelper.mapMarkerForRestaurant(restaurant, self.map);
    google.maps.event.addListener(marker, 'click', () => {
      window.location.href = marker.url
    });
    self.markers.push(marker);
  });
}

/** set up lazy loading on the images - this article used for lazy loading https://www.mercurytide.co.uk/blog/article/lazy-loading-intersection-observer-api/ */
listenLazyLoad = ()=>{

  let images = document.getElementsByClassName('restaurant-img');

  let options = {
    root: null,
    rootMargin: '0px',
    threshold: 0.01
  }

  let observeImages = (entries)=>{
    entries.forEach( ( entry ) =>{
      if(entry.intersectionRatio > 0 ){
        observer.unobserve(entry.target);
        entry.target.src = entry.target.lazySrc;
        entry.target.srcset = entry.target.lazySrcset;
      }
    })
  }

  let observer = new IntersectionObserver(observeImages, options);

  //observe all of the images
  for(i=0; i < images.length; i++){
    observer.observe(images[i]);
  }

  return 
}

generateMap = (dynamicMap)=>{

  let mapContainer = document.getElementById('map');
  let dims = {
    height: mapContainer.offsetHeight,
    width: mapContainer.offsetWidth
  }

  let loc = {
    lat: 40.722216,
    lng: -73.987501
  };

  
  if( dynamicMap === true){  // dynamic map 

    self.map = new google.maps.Map(mapContainer, {
      zoom: 12,
      center: loc,
      scrollwheel: false
    });

    addMarkersToMap()

  }else{  // static map
    
    let staticMap = document.createElement('img');
    staticMap.classList.add('static-map');
    staticMap.src=`https://maps.googleapis.com/maps/api/staticmap?center=${loc.lat},${loc.lng}&zoom=12&size=${dims.width}x${dims.height}&format=jpg&maptype=roadmap &key=AIzaSyAV6MJYAq70-YOW_SCCXFFaXzpjq8uyjAM`;
    staticMap.alt = "Map of the area";
    staticMap.addEventListener('click', ()=>{generateMap(true)})
    mapContainer.appendChild(staticMap);
  }
  


  


}