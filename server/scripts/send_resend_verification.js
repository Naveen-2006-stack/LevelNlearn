(async () => {
  try {
    const res = await fetch('http://localhost:4000/api/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nm2260@srmist.edu.in' }),
    });
    const text = await res.text();
    console.log('STATUS:', res.status);
    console.log('BODY:', text);
  } catch (err) {
    console.error('ERROR:', err);
  }
})();
