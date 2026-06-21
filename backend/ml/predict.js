const fs = require('fs');
const { RandomForestClassifier } = require('ml-random-forest');

let model = null;

function loadModel() {
  if (!model) {
    const modelData = JSON.parse(
      fs.readFileSync(__dirname + '/fraudModel.json', 'utf8')
    );

    model = RandomForestClassifier.load(modelData);
  }

  return model;
}

function predictFraud(features) {
  const rf = loadModel();

  const prediction = rf.predict([[
    features.amount,
    features.hour,
    features.dailyTxnCount,
    features.dailyVolume,
    features.accountAgeDays,
    features.userRiskScore,
    features.isNewRecipient
  ]]);

  return {
    prediction: prediction[0],
    mlScore: prediction[0] === 1 ? 85 : 15
  };
}

module.exports = {
  predictFraud
};