const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { admin, db } = require('../config/firebaseAdmin');
const { authenticateToken, isCustomer, isSalonOwner } = require('../middleware/auth');
const { validateProfileUpdate } = require('../utils/validation');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// ✅ 1. Get Customer Profile
router.get('/customer/profile', authenticateToken, isCustomer, async (req, res) => {
  try {
    const { userId } = req.user;

    const userDoc = await db.collection('customers').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();
    delete userData.password; // Remove sensitive data

    res.json({
      user: {
        id: userId,
        ...userData
      }
    });

  } catch (error) {
    console.error('Get customer profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 2. Update Customer Profile
router.put('/customer/profile', authenticateToken, isCustomer, async (req, res) => {
  try {
    const { userId } = req.user;
    const { name, phone, address, preferences } = req.body;

    // Validate input
    const validation = validateProfileUpdate({ name, phone, address });
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (name) updateData.name = name.trim();
    if (phone) updateData.phone = phone.trim();
    if (address) updateData.address = address.trim();
    if (preferences) updateData.preferences = { ...preferences };

    await db.collection('customers').doc(userId).update(updateData);

    res.json({ message: 'Profile updated successfully' });

  } catch (error) {
    console.error('Update customer profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 3. Change Customer Password
router.put('/customer/password', authenticateToken, isCustomer, async (req, res) => {
  try {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get current user data
    const userDoc = await db.collection('customers').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userData.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.collection('customers').doc(userId).update({
      password: hashedNewPassword,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change customer password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 4. Upload Customer Profile Image
router.post('/customer/profile-image', authenticateToken, isCustomer, upload.single('image'), async (req, res) => {
  try {
    const { userId } = req.user;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert image to base64 for storage (in production, use cloud storage)
    const imageBuffer = req.file.buffer;
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    // Update user profile with image
    await db.collection('customers').doc(userId).update({
      profileImage: imageUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      message: 'Profile image uploaded successfully',
      imageUrl 
    });

  } catch (error) {
    console.error('Upload customer profile image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 5. Get Salon Owner Profile
router.get('/salon/profile', authenticateToken, isSalonOwner, async (req, res) => {
  try {
    const { userId } = req.user;

    const salonDoc = await db.collection('salonOwners').doc(userId).get();
    if (!salonDoc.exists) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    const salonData = salonDoc.data();
    delete salonData.password; // Remove sensitive data

    res.json({
      salon: {
        id: userId,
        ...salonData
      }
    });

  } catch (error) {
    console.error('Get salon profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 6. Update Salon Owner Profile
router.put('/salon/profile', authenticateToken, isSalonOwner, async (req, res) => {
  try {
    const { userId } = req.user;
    const { 
      fullName, 
      email,
      salonName, 
      salonAddress, 
      phoneNumber, 
      servicesOffered, 
      openHours,
      city,
      state,
      pincode,
      location 
    } = req.body;

    console.log('Updating salon profile for user:', userId, 'with data:', req.body);

    // Validate input
    const validation = validateProfileUpdate({ 
      fullName, 
      salonName, 
      phoneNumber, 
      salonAddress,
      city,
      state,
      pincode
    });
    
    if (!validation.isValid) {
      return res.status(400).json({ error: 'Validation failed', errors: validation.errors });
    }

    const updateData = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (fullName) updateData.fullName = fullName.trim();
    if (email) updateData.email = email.trim();
    if (salonName) updateData.salonName = salonName.trim();
    if (salonAddress) updateData.salonAddress = salonAddress.trim();
    if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
    if (servicesOffered) updateData.servicesOffered = servicesOffered;
    if (openHours) updateData.openHours = openHours;
    if (city) updateData.city = city.trim();
    if (state) updateData.state = state.trim();
    if (pincode) updateData.pincode = pincode.trim();
    if (location) updateData.location = location;

    console.log('Updating salon with data:', updateData);

    // Update salon owner profile
    await db.collection('salonOwners').doc(userId).update(updateData);

    // AUTOMATICALLY SYNC WITH SALON SEARCH DATA
    console.log('Automatically syncing with salon search data...');
    try {
      // Find the corresponding salon entry
      const salonSnapshot = await db.collection('salons').where('ownerId', '==', userId).get();
      
      if (!salonSnapshot.empty) {
        const salonDoc = salonSnapshot.docs[0];
        const salonUpdateData = {};

        // Map salon owner fields to salon fields
        if (salonName) salonUpdateData.name = salonName.trim();
        if (salonAddress) salonUpdateData.address = salonAddress.trim();
        if (phoneNumber) salonUpdateData.phone = phoneNumber.trim();
        if (email) salonUpdateData.email = email.trim();
        if (city) salonUpdateData.city = city.trim();
        if (state) salonUpdateData.state = state.trim();
        if (pincode) salonUpdateData.pincode = pincode.trim();
        if (servicesOffered) {
          // Handle servicesOffered as either string or array
          const servicesArray = Array.isArray(servicesOffered) 
            ? servicesOffered 
            : servicesOffered ? servicesOffered.split(',').map(s => s.trim()).filter(s => s) 
            : [];

          salonUpdateData.services = servicesArray.map(service => ({
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            name: service,
            description: service,
            duration: 60,
            price: 0,
            category: 'general',
            isActive: true,
            createdAt: new Date()
          }));
          salonUpdateData.description = `Salon offering ${servicesArray.join(', ')}`;
        }
        if (openHours) salonUpdateData.workingHours = openHours;

        if (Object.keys(salonUpdateData).length > 0) {
          salonUpdateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          await db.collection('salons').doc(salonDoc.id).update(salonUpdateData);
          console.log('✅ Salon search data updated automatically:', salonUpdateData);
        }
      } else {
        console.log('⚠️ No corresponding salon found for owner:', userId);
      }
    } catch (syncError) {
      console.error('❌ Error syncing with salon search data:', syncError);
      // Don't fail the entire update if sync fails
    }

    res.json({ 
      message: 'Salon profile updated successfully and synced with search data',
      updatedData: updateData
    });

  } catch (error) {
    console.error('Update salon profile error:', error);
    res.status(500).json({ 
      error: 'Server error updating salon profile',
      details: error.message 
    });
  }
});

// ✅ 7. Change Salon Owner Password
router.put('/salon/password', authenticateToken, isSalonOwner, async (req, res) => {
  try {
    const { userId } = req.user;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Get current salon data
    const salonDoc = await db.collection('salonOwners').doc(userId).get();
    if (!salonDoc.exists) {
      return res.status(404).json({ error: 'Salon not found' });
    }

    const salonData = salonDoc.data();

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, salonData.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.collection('salonOwners').doc(userId).update({
      password: hashedNewPassword,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change salon password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 8. Upload Salon Profile Image
router.post('/salon/profile-image', authenticateToken, isSalonOwner, upload.single('image'), async (req, res) => {
  try {
    const { userId } = req.user;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Convert image to base64 for storage (in production, use cloud storage)
    const imageBuffer = req.file.buffer;
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:${req.file.mimetype};base64,${base64Image}`;

    // Update salon profile with image
    await db.collection('salonOwners').doc(userId).update({
      profileImage: imageUrl,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      message: 'Salon profile image uploaded successfully',
      imageUrl 
    });

  } catch (error) {
    console.error('Upload salon profile image error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 9. Toggle Salon Live Status
router.put('/salon/live-status', authenticateToken, isSalonOwner, async (req, res) => {
  try {
    const { userId } = req.user;
    const { isLive } = req.body;

    if (typeof isLive !== 'boolean') {
      return res.status(400).json({ error: 'isLive must be a boolean value' });
    }

    await db.collection('salonOwners').doc(userId).update({
      isLive,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ 
      message: `Salon is now ${isLive ? 'live' : 'offline'}`,
      isLive 
    });

  } catch (error) {
    console.error('Toggle salon live status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ 10. Deactivate Account
router.put('/deactivate', authenticateToken, async (req, res) => {
  try {
    const { userId, role } = req.user;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to deactivate account' });
    }

    // Get user data
    const collection = role === 'customer' ? 'customers' : 'salonOwners';
    const userDoc = await db.collection(collection).doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userData = userDoc.data();

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, userData.password);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Password is incorrect' });
    }

    // Deactivate account
    await db.collection(collection).doc(userId).update({
      isActive: false,
      deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    res.json({ message: 'Account deactivated successfully' });

  } catch (error) {
    console.error('Deactivate account error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 