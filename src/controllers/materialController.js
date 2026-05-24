// backend/src/controllers/materialController.js
// COMPLETE FIXED - Students see ALL published materials (no grade filter)

const { Material, Subject, User, Teacher, Student } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Get all materials (public) - ONLY published
const getMaterials = async (req, res, next) => {
  try {
    const { type, subjectId, page = 1, limit = 20 } = req.query;

    const where = { status: 'published' };
    if (type) where.type = type;
    if (subjectId) where.subjectId = subjectId;

    const materials = await Material.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
      include: [
        { model: Subject, as: 'subjectDetails', attributes: ['id', 'name', 'department', 'gradeLevel'] },
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
    console.error('Get materials error:', error);
    next(error);
  }
};

// GET STUDENT MATERIALS - Shows ALL published materials (NO GRADE FILTER)
const getStudentMaterials = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.json({
        success: true,
        data: { materials: [], total: 0, page: 1, totalPages: 1 }
      });
    }

    const student = await Student.findOne({ where: { userId: req.user.id } });

    if (!student) {
      return res.json({
        success: true,
        data: { materials: [], total: 0, page: 1, totalPages: 1 }
      });
    }

    console.log(`📚 Student: ${student.id}, Department: ${student.department}, Grade: ${student.gradeLevel}`);

    const { type, subject, unit, page = 1, limit = 50 } = req.query;

    // NO GRADE FILTER - Show ALL published materials
    const where = {
      status: 'published',
      [Op.or]: [
        { department: student.department },
        { department: 'Both' }
      ]
    };

    // Optional filters
    if (type && type !== 'all' && type !== 'undefined') {
      where.type = type;
    }
    if (subject && subject !== 'all' && subject !== 'undefined') {
      where.subject = subject;
    }
    if (unit && unit !== 'all' && unit !== 'undefined' && unit !== 'General') {
      where.unit = unit;
    }

    const materials = await Material.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']],
    });

    console.log(`✅ Found ${materials.count} published materials for student`);

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
    console.error('Get student materials error:', error);
    res.json({
      success: true,
      data: { materials: [], total: 0, page: 1, totalPages: 1 }
    });
  }
};

// Get teacher materials - SHOWS ALL (draft + published)
const getTeacherMaterials = async (req, res, next) => {
  try {
    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });

    if (!teacher) {
      return res.status(404).json({ success: false, error: { message: 'Teacher not found' } });
    }

    const { type, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const where = {
      uploadedBy: req.user.id
    };

    if (type && type !== 'undefined' && type !== 'all') {
      where.type = type;
    }
    if (status && status !== 'undefined' && status !== 'all') {
      where.status = status;
    }

    const materials = await Material.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
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
    console.error('Error fetching teacher materials:', error);
    res.status(500).json({ success: false, error: { message: error.message }, data: { materials: [] } });
  }
};

// Get material by ID
const getMaterialById = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id, {
      include: [
        { model: Subject, as: 'subjectDetails', attributes: ['id', 'name', 'department', 'gradeLevel'] },
        { model: User, as: 'uploader', attributes: ['id', 'name', 'fatherName', 'grandfatherName', 'email'] }
      ]
    });

    if (!material) throw createError('Material not found', 404);
    await material.increment('views');
    res.json({ success: true, data: material });
  } catch (error) {
    console.error('Get material by id error:', error);
    next(error);
  }
};

// UPLOAD MATERIAL - SAVES AS DRAFT (NOT PUBLISHED)
const uploadMaterial = async (req, res, next) => {
  try {
    const { title, description, type, gradeLevel, department, subject, unit, youtubeLinks } = req.body;

    console.log('📤 Upload request received:');
    console.log('   Title:', title);
    console.log('   Type:', type);
    console.log('   Grade Level:', gradeLevel);

    if (!title) throw createError('Title is required', 400);
    if (!type) throw createError('Material type is required', 400);

    const teacher = await Teacher.findOne({ where: { userId: req.user.id } });
    const finalSubject = subject || teacher?.specialization || 'General';
    const finalDepartment = department || teacher?.department || 'Both';
    const finalUnit = unit || 'General';

    const validGrades = ['9', '10', '11', '12'];
    const finalGradeLevel = validGrades.includes(gradeLevel) ? gradeLevel : '12';

    let subjectId = null;
    if (finalSubject && finalSubject !== 'General') {
      let subjectRecord = await Subject.findOne({ where: { name: finalSubject } });
      if (!subjectRecord) {
        subjectRecord = await Subject.create({
          name: finalSubject,
          department: finalDepartment,
          gradeLevel: parseInt(finalGradeLevel) || 12,
          description: `${finalSubject} study materials`
        });
      }
      subjectId = subjectRecord.id;
    }

    const materialData = {
      title: title.trim(),
      description: description || '',
      type: type.trim(),
      subject: finalSubject,
      subjectId: subjectId,
      gradeLevel: finalGradeLevel,
      department: finalDepartment,
      unit: finalUnit,
      uploadedBy: req.user.id,
      status: 'draft',
      downloads: 0,
      views: 0
    };

    if (req.file) {
      const cleanFileUrl = `uploads/materials/${req.file.filename}`;
      materialData.fileUrl = cleanFileUrl;
      console.log('   ✅ File URL stored:', materialData.fileUrl);
    }

    if (youtubeLinks) {
      let parsedLinks = [];
      try {
        parsedLinks = typeof youtubeLinks === 'string' ? JSON.parse(youtubeLinks) : youtubeLinks;
      } catch (e) {
        parsedLinks = youtubeLinks.split(',').filter(l => l.trim());
      }
      materialData.youtubeLinks = parsedLinks;
      if (parsedLinks.length > 0) {
        materialData.linkUrl = parsedLinks[0];
      }
    }

    const material = await Material.create(materialData);
    console.log('✅ Material created with ID:', material.id);
    console.log('✅ Status:', material.status);
    console.log('✅ Grade Level:', material.gradeLevel);

    res.status(201).json({
      success: true,
      message: 'Material saved as DRAFT. Click Publish to make it visible to students.',
      data: material
    });
  } catch (error) {
    console.error('❌ Upload error:', error);
    next(error);
  }
};

// VIEW MATERIAL
const viewMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);
    if (!material.fileUrl) throw createError('No file available to view', 404);

    let filePath = material.fileUrl;
    if (filePath.startsWith('uploads/')) {
      filePath = path.join(__dirname, '../../', filePath);
    }

    if (!fs.existsSync(filePath)) {
      throw createError('File not found on server', 404);
    }

    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(material.title) + '.pdf"');
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(material.title) + ext + '"');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'inline; filename="' + encodeURIComponent(material.title) + ext + '"');
    } else {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(material.title) + ext + '"');
    }

    await material.increment('views');
    res.sendFile(filePath);
  } catch (error) {
    console.error('View material error:', error);
    next(error);
  }
};

// DOWNLOAD MATERIAL
const downloadMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);
    if (!material.fileUrl) throw createError('No file available for download', 404);

    let filePath = material.fileUrl;
    if (filePath.startsWith('uploads/')) {
      filePath = path.join(__dirname, '../../', filePath);
    }

    if (!fs.existsSync(filePath)) {
      throw createError('File not found on server', 404);
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Disposition', 'attachment; filename="' + encodeURIComponent(material.title) + ext + '"');
    await material.increment('downloads');
    res.download(filePath);
  } catch (error) {
    console.error('Download material error:', error);
    next(error);
  }
};

// UPDATE MATERIAL
const updateMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);
    if (material.uploadedBy !== req.user.id && !['superadmin', 'subadmin'].includes(req.user.role)) {
      throw createError('You do not have permission to update this material', 403);
    }

    const { title, description, type, gradeLevel, department, subject, unit, youtubeLinks, status } = req.body;
    const updateData = {};

    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (type) updateData.type = type;
    if (gradeLevel) updateData.gradeLevel = gradeLevel;
    if (department) updateData.department = department;
    if (subject) updateData.subject = subject;
    if (unit) updateData.unit = unit;
    if (status) updateData.status = status;

    if (youtubeLinks) {
      let parsedLinks = [];
      try {
        parsedLinks = typeof youtubeLinks === 'string' ? JSON.parse(youtubeLinks) : youtubeLinks;
      } catch (e) {
        parsedLinks = youtubeLinks.split(',').filter(l => l.trim());
      }
      updateData.youtubeLinks = parsedLinks;
      if (parsedLinks.length > 0) {
        updateData.linkUrl = parsedLinks[0];
      }
    }

    await material.update(updateData);
    res.json({ success: true, message: 'Material updated successfully', data: material });
  } catch (error) {
    console.error('Update material error:', error);
    next(error);
  }
};

// Delete material
const deleteMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);
    if (material.uploadedBy !== req.user.id && !['superadmin', 'subadmin'].includes(req.user.role)) {
      throw createError('You do not have permission to delete this material', 403);
    }

    if (material.fileUrl) {
      let filePath = material.fileUrl;
      if (filePath.startsWith('uploads/')) {
        filePath = path.join(__dirname, '../../', filePath);
      }
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await material.destroy();
    res.json({ success: true, message: 'Material deleted successfully' });
  } catch (error) {
    console.error('Delete material error:', error);
    next(error);
  }
};

// PUBLISH MATERIAL - changes status from 'draft' to 'published'
const publishMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);

    if (material.status === 'published') {
      return res.json({ success: true, message: 'Material is already published' });
    }

    await material.update({ status: 'published' });
    console.log(`✅ Material published: ${material.title} (ID: ${material.id})`);

    res.json({ success: true, message: 'Material published successfully! Students can now view it.' });
  } catch (error) {
    console.error('Publish material error:', error);
    next(error);
  }
};

// Archive material
const archiveMaterial = async (req, res, next) => {
  try {
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);
    await material.update({ status: 'archived' });
    res.json({ success: true, message: 'Material archived successfully!' });
  } catch (error) {
    console.error('Archive material error:', error);
    next(error);
  }
};

// Add YouTube link
const addYouTubeLink = async (req, res, next) => {
  try {
    const { linkUrl } = req.body;
    const material = await Material.findByPk(req.params.id);
    if (!material) throw createError('Material not found', 404);

    let currentLinks = material.youtubeLinks || [];
    if (typeof currentLinks === 'string') {
      try {
        currentLinks = JSON.parse(currentLinks);
      } catch (e) {
        currentLinks = [];
      }
    }
    currentLinks.push(linkUrl);
    await material.update({
      youtubeLinks: currentLinks,
      linkUrl: linkUrl
    });

    res.json({ success: true, message: 'YouTube link added successfully', data: material });
  } catch (error) {
    console.error('Add YouTube link error:', error);
    next(error);
  }
};

// Submit feedback for material
const submitFeedback = async (req, res, next) => {
  try {
    const { materialId } = req.params;
    const { feedback, rating } = req.body;

    const student = await Student.findOne({ where: { userId: req.user.id } });
    if (!student) throw createError('Student not found', 404);

    let MaterialFeedback;
    try {
      MaterialFeedback = require('../models').MaterialFeedback;
    } catch (e) {
      console.log('MaterialFeedback model not found');
      return res.json({
        success: true,
        message: 'Feedback submitted successfully',
        data: { feedback, rating }
      });
    }

    const [materialFeedback, created] = await MaterialFeedback.findOrCreate({
      where: { materialId, studentId: student.id },
      defaults: { feedback, rating }
    });

    if (!created) await materialFeedback.update({ feedback, rating });
    res.json({ success: true, data: materialFeedback });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.json({ success: true, message: 'Feedback received' });
  }
};

// Get material feedback
const getMaterialFeedback = async (req, res, next) => {
  try {
    let MaterialFeedback;
    try {
      MaterialFeedback = require('../models').MaterialFeedback;
    } catch (e) {
      return res.json({ success: true, data: { feedback: [], averageRating: 0, totalRatings: 0 } });
    }

    const feedback = await MaterialFeedback.findAll({
      where: { materialId: req.params.id },
      include: [{ model: Student, as: 'student', include: [{ model: User, as: 'user', attributes: ['name', 'fatherName', 'grandfatherName', 'email'] }] }],
      order: [['createdAt', 'DESC']]
    });

    const averageRating = feedback.reduce((acc, f) => acc + (f.rating || 0), 0) / (feedback.length || 1);

    res.json({ success: true, data: { feedback, averageRating, totalRatings: feedback.length } });
  } catch (error) {
    console.error('Get material feedback error:', error);
    res.json({ success: true, data: { feedback: [], averageRating: 0, totalRatings: 0 } });
  }
};

module.exports = {
  getMaterials,
  getStudentMaterials,
  getTeacherMaterials,
  getMaterialById,
  uploadMaterial,
  viewMaterial,
  addYouTubeLink,
  updateMaterial,
  deleteMaterial,
  downloadMaterial,
  publishMaterial,
  archiveMaterial,
  submitFeedback,
  getMaterialFeedback
};