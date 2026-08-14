module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // reanimated 4 のワークレット変換。必ずプラグイン配列の最後に置く。
    plugins: ['react-native-worklets/plugin'],
  };
};
