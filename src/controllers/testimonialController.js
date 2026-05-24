// backend/src/controllers/testimonialController.js
const { Testimonial, Student, User } = require('../models');
const { createError } = require('../middleware/errorHandler');

// ===========================================
// SUBMIT TESTIMONIAL (Student)
// ===========================================
const submitTestimonial = async (req, res, next) => {
  try {
    const { comment, university, rating, isAnonymous } = req.body;

    if (!comment) {
      throw createError('Please share your success story', 400);
    }

    // Get student info
    const student = await Student.findOne({ where: { userId: req.user.id } });

    // Display name (anonymous if requested)
    const displayName = isAnonymous
      ? 'Anonymous Student'
      : req.user.name || 'Student';

    const testimonial = await Testimonial.create({
      studentId: student?.id || null,
      studentName: displayName,
      university: university || null,
      comment: comment,
      rating: rating || 5,
      isApproved: false,
      isFeatured: false
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for sharing your success story! It will be reviewed soon.',
      data: testimonial
    });
  } catch (error) {
    console.error('Submit testimonial error:', error);
    next(error);
  }
};

// ===========================================
// GET PUBLIC TESTIMONIALS (For Home Page)
// ===========================================
const getPublicTestimonials = async (req, res, next) => {
  try {
    const { limit = 6, featured = false } = req.query;

    const where = { isApproved: true };
    if (featured === 'true') {
      where.isFeatured = true;
    }

    const testimonials = await Testimonial.findAll({
      where,
      limit: parseInt(limit),
      order: [
        ['isFeatured', 'DESC'],
        ['createdAt', 'DESC']
      ],
      attributes: ['id', 'studentName', 'comment', 'university', 'rating', 'createdAt', 'isFeatured']
    });

    res.json({
      success: true,
      data: testimonials
    });
  } catch (error) {
    console.error('Get public testimonials error:', error);
    next(error);
  }
};

// ===========================================
// GET PENDING TESTIMONIALS (Admin/Teacher)
// ===========================================
const getPendingTestimonials = async (req, res, next) => {
  try {
    const testimonials = await Testimonial.findAll({
      where: { isApproved: false },
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'approver', attributes: ['id', 'name', 'fatherName', 'grandfatherName'] }]
    });

    res.json({
      success: true,
      data: testimonials
    });
  } catch (error) {
    console.error('Get pending testimonials error:', error);
    next(error);
  }
};

// ===========================================
// GET ALL TESTIMONIALS (Admin)
// ===========================================
const getAllTestimonials = async (req, res, next) => {
  try {
    const testimonials = await Testimonial.findAll({
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'approver', attributes: ['id', 'name', 'fatherName', 'grandfatherName'] }]
    });

    res.json({
      success: true,
      data: testimonials
    });
  } catch (error) {
    console.error('Get all testimonials error:', error);
    next(error);
  }
};

// ===========================================
// APPROVE TESTIMONIAL (Admin/Teacher)
// ===========================================
const approveTestimonial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { isFeatured } = req.body;

    const testimonial = await Testimonial.findByPk(id);
    if (!testimonial) {
      throw createError('Testimonial not found', 404);
    }

    await testimonial.update({
      isApproved: true,
      isFeatured: isFeatured || false,
      approvedBy: req.user.id,
      approvedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Testimonial approved successfully',
      data: testimonial
    });
  } catch (error) {
    console.error('Approve testimonial error:', error);
    next(error);
  }
};

// ===========================================
// FEATURE TESTIMONIAL (Admin)
// ===========================================
const featureTestimonial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    const testimonial = await Testimonial.findByPk(id);
    if (!testimonial) {
      throw createError('Testimonial not found', 404);
    }

    await testimonial.update({ isFeatured: featured });

    res.json({
      success: true,
      message: featured ? 'Testimonial featured on homepage' : 'Testimonial removed from featured',
      data: testimonial
    });
  } catch (error) {
    console.error('Feature testimonial error:', error);
    next(error);
  }
};

// ===========================================
// DELETE TESTIMONIAL (Admin)
// ===========================================
const deleteTestimonial = async (req, res, next) => {
  try {
    const { id } = req.params;
    const testimonial = await Testimonial.findByPk(id);
    if (!testimonial) {
      throw createError('Testimonial not found', 404);
    }
    await testimonial.destroy();
    res.json({ success: true, message: 'Testimonial deleted successfully' });
  } catch (error) {
    console.error('Delete testimonial error:', error);
    next(error);
  }
};

module.exports = {
  submitTestimonial,
  getPublicTestimonials,
  getPendingTestimonials,
  getAllTestimonials,
  approveTestimonial,
  featureTestimonial,
  deleteTestimonial
};