var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var AIActionSchema = new Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['builtin_override', 'custom'], required: true },
    builtinAction: { type: String, enum: ['generate', 'rephrase', 'translate', 'summarize'] },
    systemPrompt: { type: String, default: '' },
    adminInstructions: { type: String, default: '' },
    targetFields: [{ type: String }],
    position: { type: Number, default: 0 },
    isEnabled: { type: Boolean, default: true }
});

// Get all actions
AIActionSchema.statics.getAll = function() {
    return this.find({}).sort('position').exec();
};

// Get enabled actions
AIActionSchema.statics.getEnabled = function() {
    return this.find({ isEnabled: true }).sort('position').exec();
};

// Create action
AIActionSchema.statics.createAction = function(action) {
    return this.create(action);
};

// Update action
AIActionSchema.statics.updateAction = function(id, data) {
    return this.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
};

// Delete action
AIActionSchema.statics.deleteAction = function(id) {
    return this.findByIdAndDelete(id).exec();
};

// Backup
AIActionSchema.statics.backup = function(path) {
    var fs = require('fs');
    var AIAction = this;

    return new Promise(function(resolve, reject) {
        var writeStream = fs.createWriteStream(path + '/aiActions.json');
        writeStream.write('[');

        var cursor = AIAction.find().cursor();
        var isFirst = true;

        cursor.eachAsync(function(document) {
            if (!isFirst) {
                writeStream.write(',');
            } else {
                isFirst = false;
            }
            writeStream.write(JSON.stringify(document, null, 2));
            return Promise.resolve();
        })
        .then(function() {
            writeStream.write(']');
            writeStream.end();
        })
        .catch(function(error) {
            reject(error);
        });

        writeStream.on('finish', function() {
            resolve('ok');
        });

        writeStream.on('error', function(error) {
            reject(error);
        });
    });
};

// Restore
AIActionSchema.statics.restore = function(path) {
    var fs = require('fs');
    var AIAction = this;

    return new Promise(async function(resolve, reject) {
        try {
            if (!fs.existsSync(path + '/aiActions.json')) {
                resolve('No AI actions to restore');
                return;
            }

            var JSONStream = require('JSONStream');
            var readStream = fs.createReadStream(path + '/aiActions.json');
            var jsonStream = JSONStream.parse('*');
            readStream.pipe(jsonStream);

            readStream.on('error', function(error) {
                reject(error);
            });

            jsonStream.on('data', async function(document) {
                AIAction.findOneAndReplace({ _id: document._id }, document, { upsert: true })
                .catch(function(err) {
                    console.log(err);
                    reject(err);
                });
            });

            jsonStream.on('end', function() {
                resolve();
            });

            jsonStream.on('error', function(error) {
                reject(error);
            });
        }
        catch (error) {
            reject({ error: error, model: 'AIAction' });
        }
    });
};

var AIAction = mongoose.model('AIAction', AIActionSchema);
module.exports = AIAction;
