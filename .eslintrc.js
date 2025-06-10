module.exports = {
  parser: "@typescript-eslint/parser",
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:jsx-a11y/recommended",
    "plugin:prettier/recommended", // Enables eslint-plugin-prettier and displays prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
  ],
  parserOptions: {
    ecmaVersion: 12, // Equivalent to 2021, ensures parser supports modern syntax
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  env: {
    browser: true,
    es6: true, // es6 is recognized by older ESLint versions for ES2015 globals
    node: true,
  },
  settings: {
    react: {
      version: "detect",
    },
    "import/resolver": {
      // Ensure eslint-plugin-import can resolve TS paths if used (though not explicitly installed as a primary config like airbnb)
      typescript: {},
    },
  },
  rules: {
    "react/react-in-jsx-scope": "off", // Not needed with React 17+ new JSX transform
    "@typescript-eslint/explicit-module-boundary-types": "off", // Can be verbose, personal preference
    "no-console": "warn", // Warn about console.log usage
    "react/prop-types": "off", // Not needed with TypeScript
    // Example: Prettier rule override (often not needed if Prettier config is separate)
    // "prettier/prettier": ["warn", { "endOfLine": "auto" }]
    // Add any other specific rule overrides here
  },
};
