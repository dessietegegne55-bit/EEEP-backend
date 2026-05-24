// backend/src/routes/materialRoutes.js
// FIXED: Correct route order

const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const materialController = require('../controllers/materialController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validation');
const upload = require('../middleware/upload');

const uploadValidation = [
    body('title').notEmpty().withMessage('Title is required'),
    body('type').notEmpty().withMessage('Type is required'),
    body('gradeLevel').optional().isIn(['9', '10', '11', '12']).withMessage('Invalid grade level'),
    body('department').optional().isIn(['Natural Science', 'Social Science', 'Both']).withMessage('Invalid department'),
    body('unit').optional().isString().withMessage('Unit must be text')
];

const updateValidation = [
    body('title').optional().notEmpty().withMessage('Title cannot be empty'),
    body('type').optional().isIn(['textbook', 'pastExam', 'modelExam', 'youtube', 'note', 'reference']).withMessage('Invalid type'),
    body('gradeLevel').optional().isIn(['9', '10', '11', '12']).withMessage('Invalid grade level'),
    body('department').optional().isIn(['Natural Science', 'Social Science', 'Both']).withMessage('Invalid department'),
    body('unit').optional().isString().withMessage('Unit must be text'),
    body('status').optional().isIn(['draft', 'published', 'archived']).withMessage('Invalid status')
];

const feedbackValidation = [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5'),
    body('feedback').optional().isString().withMessage('Feedback must be text')
];

// ===========================================
// PUBLIC ROUTES
// ===========================================
router.get('/', materialController.getMaterials);
router.get('/:id/feedback', materialController.getMaterialFeedback);

// ===========================================
// VIEW & DOWNLOAD ROUTES (MUST come before /:id)
// ===========================================
router.get('/:id/view', materialController.viewMaterial);
router.get('/:id/download', materialController.downloadMaterial);

// ===========================================
// TEACHER ROUTES (MUST come before /:id)
// ===========================================
router.get('/teacher/materials',
    authenticate,
    authorize('teacher'),
    materialController.getTeacherMaterials
);

// ===========================================
// STUDENT ROUTES (MUST come before /:id)
// ===========================================
router.get('/student/materials',
    authenticate,
    authorize('student'),
    materialController.getStudentMaterials
);

router.get('/materials/student',
    authenticate,
    authorize('student'),
    materialController.getStudentMaterials
);

// ===========================================
// GET MATERIAL BY ID (MUST be LAST - after all specific routes)
// ===========================================
router.get('/:id', materialController.getMaterialById);

// ===========================================
// FEEDBACK ROUTES
// ===========================================
router.post('/:id/feedback',
    authenticate,
    authorize('student'),
    feedbackValidation,
    validate,
    materialController.submitFeedback
);

// ===========================================
// TEACHER POST ROUTES
// ===========================================
router.post('/upload',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    upload.single('file'),
    uploadValidation,
    validate,
    materialController.uploadMaterial
);

router.post('/link',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    uploadValidation,
    validate,
    materialController.addYouTubeLink
);

router.put('/:id',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    updateValidation,
    validate,
    materialController.updateMaterial
);

router.delete('/:id',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    materialController.deleteMaterial
);

router.put('/:id/publish',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    materialController.publishMaterial
);

router.put('/:id/archive',
    authenticate,
    authorize('teacher', 'superadmin', 'subadmin'),
    materialController.archiveMaterial
);

// ===========================================
// ADMIN ROUTES
// ===========================================
router.get('/admin/all',
    authenticate,
    authorize('superadmin', 'subadmin'),
    async (req, res, next) => {
        try {
            const { Material, Subject, User } = require('../models');
            const { page = 1, limit = 50, status, type, department, gradeLevel } = req.query;

            const where = {};
            if (status && status !== 'all') where.status = status;
            if (type && type !== 'all') where.type = type;
            if (department && department !== 'all') where.department = department;
            if (gradeLevel && gradeLevel !== 'all') where.gradeLevel = gradeLevel;

            const materials = await Material.findAndCountAll({
                where,
                limit: parseInt(limit),
                offset: (parseInt(page) - 1) * parseInt(limit),
                order: [['createdAt', 'DESC']],
                include: [
                    { model: Subject, as: 'subjectDetails', attributes: ['id', 'name', 'department'] },
                    { model: User, as: 'uploader', attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email'] }
                ]
            });

            res.json({
                success: true,
                data: {
                    materials: materials.rows,
                    total: materials.count,
                    page: parseInt(page),
                    totalPages: Math.ceil(materials.count / parseInt(limit))
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

router.get('/admin/stats/summary',
    authenticate,
    authorize('superadmin', 'subadmin'),
    async (req, res, next) => {
        try {
            const { Material } = require('../models');
            const { sequelize } = require('../config/database');

            const totalMaterials = await Material.count();
            const publishedMaterials = await Material.count({ where: { status: 'published' } });
            const draftMaterials = await Material.count({ where: { status: 'draft' } });
            const archivedMaterials = await Material.count({ where: { status: 'archived' } });

            const byType = await Material.findAll({
                attributes: ['type', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                group: ['type'],
                raw: true
            });

            const byDepartment = await Material.findAll({
                attributes: ['department', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: { status: 'published' },
                group: ['department'],
                raw: true
            });

            const byGrade = await Material.findAll({
                attributes: ['gradeLevel', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
                where: { status: 'published' },
                group: ['gradeLevel'],
                raw: true
            });

            res.json({
                success: true,
                data: {
                    total: totalMaterials,
                    published: publishedMaterials,
                    draft: draftMaterials,
                    archived: archivedMaterials,
                    byType,
                    byDepartment,
                    byGrade
                }
            });
        } catch (error) {
            next(error);
        }
    }
);

module.exports = router;