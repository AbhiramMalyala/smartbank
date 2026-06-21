const fs = require('fs');
const csv = require('csv-parser');
const { RandomForestClassifier } = require('ml-random-forest');

const dataset = [];

fs.createReadStream('./smartbank_dataset.csv')
  .pipe(csv())
  .on('data', row => {
    dataset.push([
      Number(row.amount),
      Number(row.hour),
      Number(row.dailyTxnCount),
      Number(row.dailyVolume),
      Number(row.accountAgeDays),
      Number(row.userRiskScore),
      Number(row.isNewRecipient),
      Number(row.label)
    ]);
  })
  .on('end', () => {

    const X = dataset.map(r => r.slice(0, 7));
    const y = dataset.map(r => r[7]);

    const rf = new RandomForestClassifier({
      nEstimators: 100,
      maxFeatures: 4,
      replacement: true,
      seed: 42
    });

    rf.train(X, y);

    fs.writeFileSync(
      './fraudModel.json',
      JSON.stringify(rf.toJSON())
    );

    console.log('✅ Random Forest model trained');
    console.log('✅ fraudModel.json created');
  });