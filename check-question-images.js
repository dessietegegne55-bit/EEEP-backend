// Check if any questions have imageUrl in database
const { Question } = require('./src/models');
const { sequelize } = require('./src/config/database');

async function checkQuestionImages() {
    try {
        await sequelize.authenticate();
        console.log('✅ Database connected');

        const questionsWithImages = await Question.findAll({
            where: {
                imageUrl: {
                    [require('sequelize').Op.ne]: null
                }
            },
            attributes: ['id', 'questionText', 'imageUrl', 'examId'],
            limit: 10
        });

        console.log('\n📊 Questions with images:', questionsWithImages.length);

        if (questionsWithImages.length > 0) {
            console.log('\n📋 Questions:');
            questionsWithImages.forEach(q => {
                console.log(`  - Question ${q.id} (Exam ${q.examId}): ${q.imageUrl}`);
            });
        } else {
            console.log('\n⚠️  No questions with images found in database');
            console.log('   This means no exam has been created with images yet.');
        }

        const totalQuestions = await Question.count();
        console.log(`\n📈 Total questions in database: ${totalQuestions}`);

        await sequelize.close();
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

checkQuestionImages();
