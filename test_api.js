const http = require('http');
fetch('http://localhost:3000/api/alerts/fire')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
