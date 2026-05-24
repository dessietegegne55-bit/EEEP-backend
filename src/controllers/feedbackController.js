// backend/src/controllers/feedbackController.js
const { Feedback, User } = require('../models');
const { createError } = require('../middleware/errorHandler');

// ===========================================
// SUBMIT FEEDBACK (Student) - General feedback to admins
// ===========================================
const submitFeedback = async (req, res, next) => {
  try {
    const { subject, message, category, rating } = req.body;

    if (!message) {
      throw createError('Feedback message is required', 400);
    }

    const feedback = await Feedback.create({
      userId: req.user.id,
      studentName: req.user.name || 'Student',
      studentEmail: req.user.email,
      subject: subject || null,
      message,
      category: category || 'general',
      rating: rating || null,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Thank you for your feedback!',
      data: feedback
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    next(error);
  }
};

// ===========================================
// GET ALL FEEDBACK (Admin only)
// ===========================================
const getAllFeedback = async (req, res, next) => {
  try {
    const feedback = await Feedback.findAll({
      order: [['createdAt', 'DESC']],
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email'] }]
    });
    res.json({ success: true, data: feedback });
  } catch (error) {
    console.error('Get all feedback error:', error);
    next(error);
  }
};

// ===========================================
// DELETE FEEDBACK (Admin only)
// ===========================================
const deleteFeedback = async (req, res, next) => {
  try {
    const { id } = req.params;
    const feedback = await Feedback.findByPk(id);
    if (!feedback) {
      throw createError('Feedback not found', 404);
    }
    await feedback.destroy();
    res.json({ success: true, message: 'Feedback deleted successfully' });
  } catch (error) {
    console.error('Delete feedback error:', error);
    next(error);
  }
};

module.exports = {
  submitFeedback,
  getAllFeedback,
  deleteFeedback
};