fetch('http://localhost:3000/api/wiki/articles/handbook-camp-staff-culture-training-customer-service')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(console.error);
