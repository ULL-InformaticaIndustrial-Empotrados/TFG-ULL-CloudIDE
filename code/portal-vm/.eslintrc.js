module.exports = {
  extends: 'airbnb-base',
  rules: {
    // prefiere backtick, pero solo warning
    //'quotes': ['warn', 'backtick', { 'avoidEscape': true }],
    // para que los then de las promesas puedan estar al mismo nivel
    'indent': ['error', 2, { 'MemberExpression': 'off'}],
    // Permitimos los subrayados
    'no-underscore-dangle': 'off',
    'no-prototype-builtins': 'off',
    'no-restricted-syntax': ['off', 'ForStatement'],
    'no-trailing-spaces': 'off', // editor se encarga de quitarlos
  }

};
