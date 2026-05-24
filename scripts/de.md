node scripts\setupDatabase.js --admins "[{\"name\":\"Dessie\",\"fatherName\":\"tegegne\",\"grandfatherName\":\"takele\",\"email\":\"dessietegegne55@gmail.com\",\"password\":\"desudesu\",\"username\":\"desu1\"}]"


node scripts\setupDatabase.js --action list

node scripts\setupDatabase.js --action delete --target desu1

node scripts\setupDatabase.js --action block --target desu1

node scripts\setupDatabase.js --action reactivate --target desu1

node scripts\setupDatabase.js --action reset-password --target desu1