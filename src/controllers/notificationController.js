const { Notification } = require('../models');
const { createError } = require('../middleware/errorHandler');
const { Op } = require('sequelize');

// Get user notifications
const getUserNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query;

    const where = {
      userId: req.user.id,
      [Op.or]: [
        { expiresAt: null },
        { expiresAt: { [Op.gt]: new Date() } }
      ]
    };

    if (unreadOnly === 'true') {
      where.isRead = false;
    }

    const notifications = await Notification.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['createdAt', 'DESC']]
    });

    const unreadCount = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      }
    });

    res.json({
      success: true,
      data: {
        notifications: notifications.rows,
        total: notifications.count,
        unreadCount,
        page: parseInt(page),
        totalPages: Math.ceil(notifications.count / parseInt(limit))
      }
    });
  } catch (error) {
    next(error);
  }
};

// Mark notification as read
const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!notification) {
      throw createError('Notification not found', 404);
    }

    await notification.update({ isRead: true });

    res.json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// Mark all notifications as read
const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.update(
      { isRead: true },
      {
        where: {
          userId: req.user.id,
          isRead: false
        }
      }
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    });
  } catch (error) {
    next(error);
  }
};

// Delete notification
const deleteNotification = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: {
        id: req.params.id,
        userId: req.user.id
      }
    });

    if (!notification) {
      throw createError('Notification not found', 404);
    }

    await notification.destroy();

    res.json({
      success: true,
      message: 'Notification deleted'
    });
  } catch (error) {
    next(error);
  }
};

// Create notification (internal use)
const createNotification = async (userId, title, message, type = 'info', link = null, metadata = null, expiresAt = null) => {
  try {
    return await Notification.create({
      userId,
      title,
      message,
      type,
      link,
      metadata,
      expiresAt
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

// Create bulk notifications
const createBulkNotifications = async (userIds, title, message, type = 'info', link = null, metadata = null) => {
  try {
    const notifications = userIds.map(userId => ({
      userId,
      title,
      message,
      type,
      link,
      metadata
    }));

    return await Notification.bulkCreate(notifications);
  } catch (error) {
    console.error('Error creating bulk notifications:', error);
    return [];
  }
};

// Get unread count
const getUnreadCount = async (req, res, next) => {
  try {
    const count = await Notification.count({
      where: {
        userId: req.user.id,
        isRead: false,
        [Op.or]: [
          { expiresAt: null },
          { expiresAt: { [Op.gt]: new Date() } }
        ]
      }
    });

    res.json({
      success: true,
      data: { count }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  createNotification,
  createBulkNotifications,
  getUnreadCount
};