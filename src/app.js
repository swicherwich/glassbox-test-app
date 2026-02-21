const express = require('express');
const orderRoutes = require('./routes/orders');
const productRoutes = require('./routes/products');
const userRoutes = require('./routes/users');

const app = express();

app.use(express.json());

app.use('/api/orders', orderRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);

// Code-only endpoint — NOT in openapi.yaml → triggers spec drift (source="code")
function healthCheck(req, res) {
  res.status(200).json({ status: 'ok' });
}

app.get('/api/health', healthCheck);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
