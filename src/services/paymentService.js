const axios = require('axios');

const PAYMENT_API_URL = process.env.PAYMENT_API_URL || 'https://payments.external.com';
const FRAUD_CHECK_API_URL = process.env.FRAUD_CHECK_API_URL || 'https://fraud.external.com';

// Ghost node: all calls here go to external APIs with no matching internal endpoints

async function chargeCard(amount, customerId, currency) {
  // External API call → ghost node (PAYMENT_API_URL)
  const response = await axios.post(PAYMENT_API_URL + '/v1/charges', {
    amount,
    customerId,
    currency,
  });

  if (!response.data.success) {
    throw new Error('Payment charge failed');
  }

  return response.data;
}

async function refundCharge(paymentId, amount) {
  // External API call → ghost node (PAYMENT_API_URL)
  const response = await axios.post(PAYMENT_API_URL + '/v1/refunds', {
    paymentId,
    amount,
  });

  return response.data;
}

async function checkFraud(customerId, amount) {
  // External API call → ghost node (FRAUD_CHECK_API_URL)
  const response = await axios.post(FRAUD_CHECK_API_URL + '/v1/assess', {
    customerId,
    amount,
  });

  if (response.data.risk === 'high') {
    throw new Error('Transaction flagged as high risk');
  }

  return response.data;
}

async function getPaymentStatus(paymentId) {
  // External API call → ghost node (PAYMENT_API_URL)
  const response = await axios.get(PAYMENT_API_URL + '/v1/charges/' + paymentId);
  return response.data;
}

module.exports = {
  chargeCard,
  refundCharge,
  checkFraud,
  getPaymentStatus,
};
