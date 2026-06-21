const fs = require('fs');

const rows = [];
rows.push('amount,hour,dailyTxnCount,dailyVolume,accountAgeDays,userRiskScore,isNewRecipient,label');

for (let i = 0; i < 1000; i++) {
  const fraud = Math.random() < 0.15; // 15% fraud

  let amount,
      hour,
      dailyTxnCount,
      dailyVolume,
      accountAgeDays,
      userRiskScore,
      isNewRecipient;

  if (fraud) {
    amount = Math.floor(Math.random() * 100000) + 50000;
    hour = Math.floor(Math.random() * 6);
    dailyTxnCount = Math.floor(Math.random() * 15) + 10;
    dailyVolume = Math.floor(Math.random() * 500000) + 200000;
    accountAgeDays = Math.floor(Math.random() * 30) + 1;
    userRiskScore = Math.floor(Math.random() * 30) + 70;
    isNewRecipient = 1;
  } else {
    amount = Math.floor(Math.random() * 30000) + 1000;
    hour = Math.floor(Math.random() * 24);
    dailyTxnCount = Math.floor(Math.random() * 5) + 1;
    dailyVolume = Math.floor(Math.random() * 50000) + 5000;
    accountAgeDays = Math.floor(Math.random() * 1000) + 100;
    userRiskScore = Math.floor(Math.random() * 40);
    isNewRecipient = Math.random() < 0.2 ? 1 : 0;
  }

  rows.push(
    `${amount},${hour},${dailyTxnCount},${dailyVolume},${accountAgeDays},${userRiskScore},${isNewRecipient},${fraud ? 1 : 0}`
  );
}

fs.writeFileSync('smartbank_dataset.csv', rows.join('\n'));

console.log('Dataset created successfully.');