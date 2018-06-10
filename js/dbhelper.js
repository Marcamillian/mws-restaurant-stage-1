/**
 * Common database helper functions.
 */
class DBHelper {

  static get RESTAURANT_STORE_NAME(){
    return 'restaurant-details'
  }

  static get REVIEW_STORE_NAME(){
    return 'review-details'
  }

  static get PENDING_REQUEST_STORE(){
    return 'pending-requests'
  }

  constructor(){
    this.dbPromise = idb.open(DBHelper.RESTAURANT_STORE_NAME, 3, (upgradeDb)=>{

      switch(upgradeDb.oldVersion){
        case 0:
          var restaurantStore = upgradeDb.createObjectStore( DBHelper.RESTAURANT_STORE_NAME, {keyPath:'id'});
          restaurantStore.createIndex('by-neighborhood', 'neighborhood');
          restaurantStore.createIndex('by-cuisine', 'cuisine_type');
          restaurantStore.createIndex('by-favorite', 'is_favorite')
        case 1:
          var reviewStore = upgradeDb.createObjectStore(DBHelper.REVIEW_STORE_NAME, {keyPath:'id'})
          reviewStore.createIndex('by-restaurant-id', 'restaurant_id');
        case 2:
         var pendingRequestsStore = upgradeDb.createObjectStore(DBHelper.PENDING_REQUEST_STORE, {autoIncrement:true})
         pendingRequestsStore.createIndex('by-request-type', 'requestType')
      }
    })

  }

  // populate the local IndexedDB database
  // TODO: make this handle not having a connection
  populateOfflineDatabase(){
    return fetch(`${DBHelper.DATABASE_URL}/restaurants`)
      .then((response)=>{ return response.json(); })
      .then((restaurants)=>{ return Promise.all(restaurants.map((response)=>{this.addRecord(DBHelper.RESTAURANT_STORE_NAME, response)}, this)) })
      .then(()=>{ console.log(`Database filled`) })
      .catch((err)=>{
        console.log(`Database not updated with fresh network data:  ${err}`)
      })
  }

  refreshReviewData(restaurantId){
    return fetch(`${DBHelper.DATABASE_URL}/reviews/?restaurant_id=${restaurantId}`)
    .then((response)=>{ return response.json(); })
    .then((reviews)=>{ return Promise.all(reviews.map((review)=>{this.addRecord(DBHelper.REVIEW_STORE_NAME, review)}, this)) })
    .then(()=>{console.log(`Reviews updated for restaurant ${restaurantId}`)})
    .catch((err)=>{
      console.log(`Reviews database not updated: ${restaurantId}`)
    })
  }

  addRecord(storeName, recordObject){
    return this.dbPromise.then((db)=>{
      var tx = db.transaction(storeName, 'readwrite');
      var listStore = tx.objectStore(storeName);
      listStore.put(recordObject)
      return tx.complete;
    })
  }
  
  getRestaurants(){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction('restaurant-details')
      let restaurantDetailsStore = tx.objectStore('restaurant-details')
      return restaurantDetailsStore.getAll();
    })
  }

  getRestaurantById(restaurantId, callback){ 
    return this.dbPromise.then((db)=>{  // try to get it from the local database
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME)
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME)
      return restaurantDetailsStore.get(restaurantId)
    }).then((response)=>{ // if nothing from the local database - get from the network
      return (response != undefined)
        ? response
        : fetch(`${DBHelper.DATABASE_URL}/restaurants/${restaurantId}`) // grab the restaurant from the database
            .then(response => response.json()) // unwrap the json
            .then(response => { // store the response
              this.addRecord(DBHelper.RESTAURANT_STORE_NAME, response);
              return response
            })
    })
  }

  getRestaurantsByCuisine(cuisine){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME);
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME);

      return restaurantDetailsStore.index('by-cuisine').getAll(cuisine)
    })
  }

  getRestaurantsByNeighborhood(neighborhood){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME);
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME);

      return restaurantDetailsStore.index('by-neighborhood').getAll(neighborhood);
    })
  }

  getRestaurantsByCuisineAndNeighborhood(cuisine, neighborhood, numRecords){

    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME);
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME)
      let restaurants = [];

      restaurantDetailsStore.index('by-cuisine').openCursor(cuisine, "next")
      .then(function checkRestaurant(cursor){
        if(!cursor || restaurants.length >= numRecords ) return; 
        if(cursor.value.neighborhood == neighborhood
            || neighborhood == undefined ) restaurants.push(cursor.value)
        return cursor.continue().then( checkRestaurant )
      })
      
      return tx.complete.then( () => restaurants )
    })

  }

  getCuisines(){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME)
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME)
      let cuisineKeys = [];

      restaurantDetailsStore.index('by-cuisine').openCursor(null, "nextunique")
        .then(function collectKeys(cursor){
          if(!cursor) return; // return if we get to the end

          cuisineKeys.push(cursor.key);

          return cursor.continue().then( collectKeys ) // keep going
        })

      return tx.complete.then(() => {
        return cuisineKeys
      } ) 
    })
  }

  getNeighborhoods(){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME)
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME)
      let neighborhoods = [];

      restaurantDetailsStore.index('by-neighborhood').openCursor(null, "nextunique")
        .then(function collectKeys(cursor){
          if(!cursor) return; // return if we get to the end
          neighborhoods.push(cursor.key);
          return cursor.continue().then( collectKeys ) // keep going
        })

      return tx.complete.then(() => {
        return neighborhoods
      } ) 
    })
  }

  getReviewsByRestaurantId(restaurantId){
    // get restaurants for that id
    return this.dbPromise.then((db)=>{// try to get the reviews from database
      let tx = db.transaction([DBHelper.REVIEW_STORE_NAME, DBHelper.PENDING_REQUEST_STORE]);
      let reviewDetailsStore = tx.objectStore(DBHelper.REVIEW_STORE_NAME);
      let pendingRequestObjectStore = tx.objectStore(DBHelper.PENDING_REQUEST_STORE);
      let pendingReviews = [];


      return Promise.all([  // get both idb reviews and pending reviews
        reviewDetailsStore.index('by-restaurant-id').getAll(restaurantId),
        pendingRequestObjectStore.index('by-request-type').openCursor('review')
        .then(function filterForRestaurant(cursor){ // check that the pending review is for this restaurant
          if(!cursor) return pendingReviews
          else{
            let request = cursor.value
            let reviewData = JSON.parse(request['options']['body']);

            if(reviewData['restaurant_id'] == restaurantId){
              pendingReviews.push(reviewData);
            }
            return cursor.continue().then(filterForRestaurant)
          }
        })
      ])
      
    }).then((responses)=>{ // join the results
      let combinedReviews = [];
      return responses.reduce((result, response)=>{
        return result.concat(response)
      },combinedReviews)
    }).then((response)=>{// check if we have anything to show
      return(response.length != 0)
        ? response
        :fetch(`${DBHelper.DATABASE_URL}/reviews/?restaurant_id=${restaurantId}`)
          .then((response)=>{return response.json()})
          .then((reviews) =>{
            Promise.all(reviews.map((review)=>{
              return this.addRecord(DBHelper.REVIEW_STORE_NAME, review)
            }));
            return reviews
          })
    })
    
  }

  storePendingRequest(requestObject){

    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.PENDING_REQUEST_STORE, 'readwrite');
      let pendingRequestObjectStore = tx.objectStore(DBHelper.PENDING_REQUEST_STORE);

      pendingRequestObjectStore.put(requestObject)

      return tx.complete;
    })
  }

  getPendingRequests(){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.PENDING_REQUEST_STORE)
      let pendingRequestStore = tx.objectStore(DBHelper.PENDING_REQUEST_STORE)
      let requests = [];

      return pendingRequestStore.openCursor()
      .then(function getRequests(cursor){
        if(cursor){
          requests.push({
            storeKey: cursor.key,
            requestObject:cursor.value
          })
          return cursor.continue().then(getRequests)
        }else{
          return requests
        }
      })
    })
  }

  sendPendingRequests(){
    // open up all hte pending requests
    const completeRequests = [];

    this.getPendingRequests()
    .then((requestArray)=>{
      // wait for all the fetch requests to complete
      return Promise.all(requestArray.map(({storeKey, requestObject})=>{
        // try to send the request
        return fetch(requestObject.url,requestObject.options)
        // if fetch successful - put it on a list to delete
        .then(()=>{ completeRequests.push(storeKey)})
        // catch any errors
        .catch((err)=>{
          console.log(`invaid request: ${requestObject.url} : ${err.message}`)
        })
      }))
      // delete the requests that were successful
    }).then(()=>{
      console.log("promises processed")
      console.log(`can now delete pending requests ${completeRequests.toString()}`)
      return this.deletePendingRequests(completeRequests)
    })
  }

  deletePendingRequests(storeKeyArray){
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.PENDING_REQUEST_STORE, 'readwrite')
      let pendingRequestStore = tx.objectStore(DBHelper.PENDING_REQUEST_STORE)
      storeKeyArray.forEach((storeKey)=>{
        pendingRequestStore.delete(storeKey)
      })

      return tx.complete
    })
  }

  toggleAsFavorite(restaurantId){

    let isOnline = navigator.onLine;

    // set it locally
    return this.dbPromise.then((db)=>{
      let tx = db.transaction(DBHelper.RESTAURANT_STORE_NAME, "readwrite");
      let restaurantDetailsStore = tx.objectStore(DBHelper.RESTAURANT_STORE_NAME);
      let updatedFavValue;

      restaurantDetailsStore.openCursor(restaurantId, 'next')
      .then( function setFavorite(cursor){
        if(cursor){
          let updateData = cursor.value;
          
          updateData.is_favorite = !/true/i.test(updateData.is_favorite);
          updatedFavValue = updateData.is_favorite;

          cursor.update(updateData)
          .then(()=>{
            console.log(`${updateData.name} favorite: ${updateData.is_favorite}`
          )})

          cursor.continue().then( setFavorite ) // go to the next result
        }else{  // when at the end of the results
          // prepare the request to send to the server

          let requestObject = {
            url: `${DBHelper.DATABASE_URL}/restaurants/${restaurantId}/?is_favorite=${updatedFavValue}`,
            options: {method: 'PUT'}
          }

          if(isOnline){ // send it to the server
            return fetch(requestObject.url, requestObject.options)
          }else{  // store the record for sending when you are back online
            return dbHelper.storePendingRequest(requestObject)
          }

        }
      })
    })
  }

  postReview(restaurantId, reviewData){

    let requestObject;

    reviewData['restaurant_id'] = restaurantId;

    requestObject = {
      requestType: 'review',
      url: 'http://localhost:1337/reviews/',
      options:{
        method: 'POST',
        body:JSON.stringify(reviewData)
      }
    }
    
    // try to send to the server
    return this.dbPromise.then(()=>{
      // if online -- send to server
      if(navigator.onLine){
        return fetch(requestObject.url, requestObject.options)
      }else{  
      // store locally till it can be sent
        return dbHelper.storePendingRequest(requestObject)
      }
    })

  }

  storeTestPendingReview(restaurantId, reviewData){
    let requestObject;

    reviewData['restaurant_id'] = restaurantId;

    requestObject = {
      requestType: 'review',
      url: 'http://localhost:1337/reviews/',
      options:{
        method: 'POST',
        body:JSON.stringify(reviewData)
      }
    }
    
    return dbHelper.storePendingRequest(requestObject)
  }

  static testFavToggle(restaurantId, favBoolean){
    let requestObject = {
      url: `${DBHelper.DATABASE_URL}/restaurants/${restaurantId}/?is_favorite=${favBoolean}`,
      options: {method: 'PUT'}
    }

    return fetch(requestObject.url, requestObject.options)
  }

  createTestPendingRequest(restaurantId, favValue){
    let requestObject = {
      url: `${DBHelper.DATABASE_URL}/restaurants/${restaurantId}/?is_favorite=${favValue}`,
      options: {method: 'PUT'}
    }
    this.storePendingRequest(requestObject);
  }

  /**
   * Database URL.
   * Change this to restaurants.json file location on your server.
   */
  static get DATABASE_URL() {
    const port = 1337 // Change this to your server port
    return `http://localhost:${port}`;
  }

  /**
   * Fetch all restaurants.
   */
  static fetchRestaurants(callback) {
    // TODO: - how to deal with a failed fetch request to data source
    let xhr = new XMLHttpRequest();
    xhr.open('GET', `${DBHelper.DATABASE_URL}/restaurants`);
    xhr.onload = () => {
      if (xhr.status === 200) { // Got a success response from server!
        const restaurants = JSON.parse(xhr.responseText);
        callback(null, restaurants);
      } else { // Oops!. Got an error from server.
        // grab the data from the local database
        const error = (`Request failed. Returned status of ${xhr.status}`);
        callback(error, null);
      }
    };
    xhr.send();
  }

  
  /**
   * Fetch a restaurant by its ID.
   */
  static fetchRestaurantById(id, callback) {
    // fetch all restaurants with proper error handling.
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        const restaurant = restaurants.find(r => r.id == id);
        if (restaurant) { // Got the restaurant
          callback(null, restaurant);
        } else { // Restaurant does not exist in the database
          callback('Restaurant does not exist', null);
        }
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine type with proper error handling.
   */
  static fetchRestaurantByCuisine(cuisine, callback) {
    // Fetch all restaurants  with proper error handling
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given cuisine type
        const results = restaurants.filter(r => r.cuisine_type == cuisine);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a neighborhood with proper error handling.
   */
  static fetchRestaurantByNeighborhood(neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Filter restaurants to have only given neighborhood
        const results = restaurants.filter(r => r.neighborhood == neighborhood);
        callback(null, results);
      }
    });
  }

  /**
   * Fetch restaurants by a cuisine and a neighborhood with proper error handling.
   */
  static fetchRestaurantByCuisineAndNeighborhood(cuisine, neighborhood, callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        let results = restaurants
        if (cuisine != 'all') { // filter by cuisine
          results = results.filter(r => r.cuisine_type == cuisine);
        }
        if (neighborhood != 'all') { // filter by neighborhood
          results = results.filter(r => r.neighborhood == neighborhood);
        }
        callback(null, results);
      }
    });
  }

  /**
   * Fetch all neighborhoods with proper error handling.
   */
  static fetchNeighborhoods(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all neighborhoods from all restaurants
        const neighborhoods = restaurants.map((v, i) => restaurants[i].neighborhood)
        // Remove duplicates from neighborhoods
        const uniqueNeighborhoods = neighborhoods.filter((v, i) => neighborhoods.indexOf(v) == i)
        callback(null, uniqueNeighborhoods);
      }
    });
  }

  /**
   * Fetch all cuisines with proper error handling.
   */
  static fetchCuisines(callback) {
    // Fetch all restaurants
    DBHelper.fetchRestaurants((error, restaurants) => {
      if (error) {
        callback(error, null);
      } else {
        // Get all cuisines from all restaurants
        const cuisines = restaurants.map((v, i) => restaurants[i].cuisine_type)
        // Remove duplicates from cuisines
        const uniqueCuisines = cuisines.filter((v, i) => cuisines.indexOf(v) == i)
        callback(null, uniqueCuisines);
      }
    });
  }

  /**
   * Restaurant page URL.
   */
  static urlForRestaurant(restaurant) {
    return (`./restaurant.html?id=${restaurant.id}`);
  }

  /**
   * Restaurant image URL.
   */
  static imageUrlForRestaurant(restaurant) {
    return (restaurant.photograph != undefined)
      ? `/img/${restaurant.photograph}`
      : '/img/noneProvided'
  }
  static imageAltTextForRestaurant(restaurant){
    return (restaurant.photoAltText != undefined)
      ? restaurant.photoAltText
      : `picture of ${restaurant.name} premises`  
  }
  /**
   * Map marker for a restaurant.
   */
  static mapMarkerForRestaurant(restaurant, map) {
    const marker = new google.maps.Marker({
      position: restaurant.latlng,
      title: restaurant.name,
      url: DBHelper.urlForRestaurant(restaurant),
      map: map,
      animation: google.maps.Animation.DROP}
    );
    return marker;
  }

}
