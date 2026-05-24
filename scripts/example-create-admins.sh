#!/bin/bash
# Example script to create multiple Super Admins dynamically
# Usage: bash scripts/example-create-admins.sh

echo "🚀 Creating Multiple Super Admins with Dynamic Data..."
echo ""

# Example 1: Single Admin
echo "Example 1: Creating single admin..."
node scripts/setupDatabase.js --admins '[
  {
    "name": "Abebe Kebede",
    "fatherName": "Kebede",
    "grandfatherName": "Tesfaye",
    "email": "abebe.kebede@eeep.com"
  }
]'

# Example 2: Multiple Admins (Uncomment to use)
# echo ""
# echo "Example 2: Creating multiple admins..."
# node scripts/setupDatabase.js --admins '[
#   {
#     "name": "Abebe Kebede",
#     "fatherName": "Kebede",
#     "grandfatherName": "Tesfaye",
#     "email": "abebe@eeep.com"
#   },
#   {
#     "name": "Tigist Haile",
#     "fatherName": "Haile",
#     "grandfatherName": "Gebre",
#     "email": "tigist@eeep.com"
#   },
#   {
#     "name": "Dawit Mengistu",
#     "fatherName": "Mengistu",
#     "grandfatherName": "Wolde",
#     "email": "dawit@eeep.com"
#   }
# ]'

# Example 3: From JSON file (Uncomment to use)
# echo ""
# echo "Example 3: Creating admins from JSON file..."
# node scripts/setupDatabase.js --admins "$(cat scripts/admins-example.json)"

echo ""
echo "✅ Done! Check your email for login credentials."
