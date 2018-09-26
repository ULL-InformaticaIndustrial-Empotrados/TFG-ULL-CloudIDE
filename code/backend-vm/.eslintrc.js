module.exports = {
    "extends": "airbnb-base",
    "rules": {
        // prefiere backtick, pero solo warning
        "quotes": ["warn", "backtick", { "avoidEscape": true }],
        // para que los then de las promesas puedan estar al mismo nivel
        'indent': ['error', 2, { 'MemberExpression': 'off'}]
    }

};