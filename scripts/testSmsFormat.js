/**
 * @file scripts/testSmsFormat.js
 * @description Standalone harness for eyeballing the SMS + email bodies
 * produced by lib/publishSchedule._buildBatchNotification — no PDF gen,
 * no Graph upload, no Azure auth, no DB. Run with:
 *   node scripts/testSmsFormat.js
 */

import { _buildBatchNotification } from '../lib/publishSchedule.js';

/**
 * Render one case and print subject + char counts + SMS + email bodies.
 *
 * @param {string} label
 * @param {object} vol
 * @param {Array<object>} dayInfos
 * @returns {void}
 */
function run(label, vol, dayInfos) {
    const { subject, emailBody, smsBody } = _buildBatchNotification(vol, dayInfos);
    console.log('\n' + '='.repeat(72));
    console.log(`CASE: ${label}`);
    console.log('='.repeat(72));
    console.log(`Subject:   ${subject}`);
    console.log(`SMS chars: ${smsBody.length}`);
    console.log('--- SMS ---');
    console.log(smsBody);
    console.log('--- EMAIL ---');
    console.log(emailBody);
}

const vol = { id: 1, firstName: 'Jake', lastName: 'Ladd' };

// ── Case 1: 3 days, single location each (matches your actual SMS sample)
run('3 days, single location (Parking Desk)', vol, [
    {
        dayId: 1, dayLabel: 'Friday', conventionDate: '2026-07-03',
        downloadUrl: 'https://www.albanyjwparking.org/schedule/pdf/1782849778706-Friday_Schedule_Jul_3_2026.pdf',
        isRemoved: false,
        assignments: [
            { shift_label: 'Desk AM 1',         location_name: 'Parking Desk', start_time: '10:00 AM', end_time: '11:10 AM', slot_type: null },
            { shift_label: 'Desk AM 2',         location_name: 'Parking Desk', start_time: '11:10 AM', end_time: '12:45 PM', slot_type: null },
            { shift_label: 'Desk Afternoon 1',  location_name: 'Parking Desk', start_time: '12:45 PM', end_time: '2:00 PM',  slot_type: null },
            { shift_label: 'Afternoon Desk 2',  location_name: 'Parking Desk', start_time: '2:00 PM',  end_time: '3:30 PM',  slot_type: null },
            { shift_label: 'Post-Session Desk', location_name: 'Parking Desk', start_time: '3:30 PM',  end_time: '5:00 PM',  slot_type: null },
        ],
    },
    {
        dayId: 2, dayLabel: 'Saturday', conventionDate: '2026-07-04',
        downloadUrl: 'https://www.albanyjwparking.org/schedule/pdf/1782849798329-Saturday_Schedule_Jul_4_2026.pdf',
        isRemoved: false,
        assignments: [
            { shift_label: 'Pre-Session Desk',  location_name: 'Parking Desk', start_time: '5:30 AM',  end_time: '10:00 AM', slot_type: 'keyman' },
            { shift_label: 'Desk Morning 1',    location_name: 'Parking Desk', start_time: '10:00 AM', end_time: '11:00 AM', slot_type: null },
            { shift_label: 'Morning Desk 2',    location_name: 'Parking Desk', start_time: '11:00 AM', end_time: '12:00 PM', slot_type: null },
            { shift_label: 'Desk Lunch',        location_name: 'Parking Desk', start_time: '12:00 PM', end_time: '1:00 PM',  slot_type: null },
            { shift_label: 'Afternoon Desk 1',  location_name: 'Parking Desk', start_time: '1:00 PM',  end_time: '2:15 PM',  slot_type: null },
            { shift_label: 'Afternoon Desk 2',  location_name: 'Parking Desk', start_time: '2:15 PM',  end_time: '3:30 PM',  slot_type: null },
            { shift_label: 'Afternoon Desk 3',  location_name: 'Parking Desk', start_time: '3:30 PM',  end_time: '4:30 PM',  slot_type: null },
            { shift_label: 'Post-Session Desk', location_name: 'Parking Desk', start_time: '4:30 PM',  end_time: '6:00 PM',  slot_type: null },
        ],
    },
    {
        dayId: 3, dayLabel: 'Sunday', conventionDate: '2026-07-05',
        downloadUrl: 'https://www.albanyjwparking.org/schedule/pdf/1782849812089-Sunday_Schedule_Jul_5_2026.pdf',
        isRemoved: false,
        assignments: [
            { shift_label: 'Pre-Session Desk',  location_name: 'Parking Desk', start_time: '5:30 AM',  end_time: '10:00 AM', slot_type: null },
            { shift_label: 'Morning Desk 1',    location_name: 'Parking Desk', start_time: '10:00 AM', end_time: '11:10 AM', slot_type: null },
            { shift_label: 'Morning Desk 2',    location_name: 'Parking Desk', start_time: '11:10 AM', end_time: '12:45 PM', slot_type: null },
            { shift_label: 'Afternoon Desk 2',  location_name: 'Parking Desk', start_time: '12:45 PM', end_time: '2:00 PM',  slot_type: null },
            { shift_label: 'Afternoon Desk 2',  location_name: 'Parking Desk', start_time: '2:00 PM',  end_time: '3:45 PM',  slot_type: null },
            { shift_label: 'Post-Session Desk', location_name: 'Parking Desk', start_time: '3:45 PM',  end_time: '5:00 PM',  slot_type: null },
        ],
    },
]);

// ── Case 2: single day, multi-location (exercises indented sub-blocks)
run('Single day, multi-location', vol, [
    {
        dayId: 1, dayLabel: 'Saturday', conventionDate: '2026-07-04',
        downloadUrl: 'https://example.com/saturday.pdf',
        isRemoved: false,
        assignments: [
            { shift_label: 'Lot Setup',    location_name: 'Garage A',     start_time: '6:00 AM',  end_time: '8:00 AM',  slot_type: 'keyman' },
            { shift_label: 'Lot Coverage', location_name: 'Garage A',     start_time: '8:00 AM',  end_time: '10:00 AM', slot_type: null },
            { shift_label: 'Desk Morning', location_name: 'Parking Desk', start_time: '10:00 AM', end_time: '12:00 PM', slot_type: null },
            { shift_label: 'Drop-off',     location_name: 'North Entry',  start_time: '12:00 PM', end_time: '2:00 PM',  slot_type: 'keyman_asst' },
        ],
    },
]);

// ── Case 3: removed from a day (differential mode)
run('Removed from one day', vol, [
    {
        dayId: 1, dayLabel: 'Friday', conventionDate: '2026-07-03',
        downloadUrl: 'https://example.com/friday.pdf',
        isRemoved: true,
        assignments: [
            { shift_label: 'Desk AM 1', location_name: 'Parking Desk', start_time: '10:00 AM', end_time: '11:10 AM', slot_type: null },
        ],
    },
]);

// ── Case 4: oversight-only, no assignments (simple headline path)
run('Oversight-only, no assignments', vol, [
    {
        dayId: 1, dayLabel: 'Friday', conventionDate: '2026-07-03',
        downloadUrl: 'https://example.com/friday.pdf',
        isRemoved: false,
        assignments: [],
    },
]);