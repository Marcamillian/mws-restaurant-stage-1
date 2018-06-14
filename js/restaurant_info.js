let restaurant;
var map;
let dbHelper = new DBHelper()
let reviewForm;


/**
 * Initialize Google map, called from HTML.
 */
window.addEventListener('DOMContentLoaded', (event)=>{

  // Detect offline
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
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)


  // get the restaurant ID
  dbHelper.getRestaurantById(Number(getParameterByName('id')))
  .then((restaurant)=>{ // set the restaurant details
    self.restaurant = restaurant;
    fillRestaurantHTML(restaurant) // render the restaurant data
    self.fillBreadcrumb(); // render the breadcrumb
    return restaurant;
  })
  .then((restaurant)=>{ // update the cache if online
    if(navigator.onLine){ // if online 
      // get the new reviews from the server
      return dbHelper.refreshReviewData(restaurant.id)
      .then(()=>{ return restaurant })
    }else{  // if not return the restaurant object
      return restaurant
    }
  // get the reviews
  })
  .then((restaurant)=>{ 
    return dbHelper.getReviewsByRestaurantId(restaurant.id)
  })
  .then(self.fillReviewsHTML) 
  .then((retaurant)=>{
    this.generateMap();
  })
   

  // control what reviewForm submission does
  reviewForm = document.querySelector('form#review-form')
})

/**
 * Get current restaurant from page URL.
 */
fetchRestaurantFromURL = (callback) => {
  if (self.restaurant) { // restaurant already fetched!
    callback(null, self.restaurant)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    error = 'No restaurant id in URL'
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantById(id, (error, restaurant) => {
      self.restaurant = restaurant;
      if (!restaurant) {
        console.error(error);
        return;
      }
      fillRestaurantHTML();
      callback(null, restaurant)
    });
  }
}

/**
 * Create restaurant HTML and add it to the webpage
 */
fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img'

  const baseImageUrl = DBHelper.imageUrlForRestaurant(restaurant);
  const urlComponents = baseImageUrl.split(".");
  // TODO: Increase the quality of the pictures for bigger sizes
  image.src = `${urlComponents[0]}-400_1x.${urlComponents[1] || 'jpg'}`; // src for fallback
  image.srcset = `${urlComponents[0]}-400_1x.${urlComponents[1] || 'jpg'} 1x,
                  ${urlComponents[0]}-800_2x.${urlComponents[1] || 'jpg'} 2x`

  image.alt = DBHelper.imageAltTextForRestaurant(restaurant);

  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;

  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
  //  get & fill reviews  

}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
}

/**
 * Create all reviews HTML and add them to the webpage.
 */
fillReviewsHTML = (reviews = self.restaurant.reviews) => {
  const container = document.getElementById('reviews-container');
  const title = document.createElement('h2');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }
  const ul = document.getElementById('reviews-list');
  reviews.forEach(review => {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);
}

/**
 * Create review HTML and add it to the webpage.
 */
createReviewHTML = (review) => {
  const li = document.createElement('li');
  const name = document.createElement('p');
  name.innerHTML = review.name;
  li.appendChild(name);

  const date = document.createElement('p');
  
  reviewDate = new Date(review.createdAt)
  date.innerHTML = reviewDate.toDateString()
  li.appendChild(date); 

  const rating = document.createElement('p');
  rating.innerHTML = `Rating: ${review.rating}`;
  li.appendChild(rating);

  const comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);

  return li;
}

clearReviewsHTML = ()=>{
  let reviewsContainer = document.querySelector('#reviews-container');
  let reviewsTitle = reviewsContainer.querySelector('h2')
  let reviewsList = reviewsContainer.querySelector('ul')

  reviewsContainer.removeChild(reviewsTitle);
  
  while (reviewsList.hasChildNodes()){
    reviewsList.removeChild(reviewsList.lastChild)
  }

}

getReviewFields = ()=>{
  return {
   name: reviewForm.elements['review-name'].value,
   rating: reviewForm.elements['review-rating'].value,
   comments: reviewForm.elements['review-comments'].value
 }
}

clearReviewFields = ()=>{
  reviewForm.elements['review-name'].value = null;
  reviewForm.querySelectorAll('input[type=radio]').forEach((radio)=>{ radio.checked = false})
  reviewForm.elements['review-comments'].value = null;
}

sendReview = (event)=>{
 event.preventDefault();

 return dbHelper.postReview(self.restaurant.id, getReviewFields())
 .then((postReponse)=>{  // clear the form
    return clearReviewFields()
  })
 .then(()=>{ // update the database
   return (navigator.onLine === true) ? dbHelper.refreshReviewData(self.restaurant.id) : undefined
 })
 .then(()=>{ // get the reviews
   return dbHelper.getReviewsByRestaurantId(self.restaurant.id)
 }).then((reviews)=>{
   clearReviewsHTML();
   return fillReviewsHTML(reviews)
 })
}

refreshReviewHTML = ()=>{
  // reset the reviews html to the beginning - reviews container and reviews-list ul


}

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
fillBreadcrumb = (restaurant=self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
}

/**
 * Get a parameter by name from page URL.
 */
getParameterByName = (name, url) => {
  if (!url)
    url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

generateMap = (dynamicMap)=>{

  let mapContainer = document.getElementById('map');
  let dims = {
    height: mapContainer.offsetHeight,
    width: mapContainer.offsetWidth
  }

  let loc = self.restaurant.latlng;

  
  if( dynamicMap === true){  // dynamic map 

    dbHelper.getRestaurantById(getParameterByName('id'))
    .then((restaurant)=>{  // set the map details
      self.map = new google.maps.Map(document.getElementById('map'),{
        zoom: 16,
        center: loc,
        scrollwheel: false
      })
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.map);
    })

  }else{  // static map
    
    let staticMap = document.createElement('img');
    staticMap.classList.add('static-map');
    staticMap.src=`https://maps.googleapis.com/maps/api/staticmap?center=${loc.lat},${loc.lng}&zoom=16&size=${dims.width}x${dims.height}&format=jpg&maptype=roadmap &key=AIzaSyAV6MJYAq70-YOW_SCCXFFaXzpjq8uyjAM`;
    staticMap.alt = "Map of the area";
    staticMap.addEventListener('click', ()=>{generateMap(true)})
    mapContainer.appendChild(staticMap);
  }
}

