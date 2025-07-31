const express = require('express');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const path = require('path');
const app = express();
const puppeteer = require('puppeteer');
const fs = require('fs');
const pdf = require('pdfkit');
const PDFDocument = require('pdfkit');
const pdfmake = require('pdfmake/build/pdfmake');
const vfsFonts = require('pdfmake/build/vfs_fonts');
pdfmake.vfs = vfsFonts.pdfMake.vfs; // Cargar fuentes

const port = 6100;
 
// Configurar middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static('public'));

// Función para manejar la reconexión automática
let db;
function handleDisconnect() {
    db = mysql.createConnection({
        host: '200.58.106.156',
        user: 'c2710325_killer',
        password: 'SistemaIES6021',  // Ajusta según tu configuración
        database: 'c2710325_sistema'
    });

    db.connect((err) => {
        if (err) {
            console.error('Error al conectar a la base de datos:', err);
            setTimeout(handleDisconnect, 2000); // Reintentar conexión después de 2 segundos
        } else {
            console.log('Conectado a la base de datos.');
        }
    });

    // Manejar errores de conexión
    db.on('error', (err) => {
        console.error('Error en la conexión a la base de datos:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // Volver a conectar si se pierde la conexión
        } else {
            throw err;
        }
    });
}

// Iniciar el proceso de conexión
handleDisconnect();

// Ruta para servir la página principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Ruta para servir la página de registro
app.get('/register-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/register.html'));
});

app.get('/inscripcion-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/inscripcion.html'));
});


// Ruta para servir la página de asistencia
app.get('/attendance-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/asistencia.html'));
});



// Ruta para buscar docentes por DNI
app.post('/buscar-alumno', (req, res) => {
    const { dni } = req.body;
    const query = 'SELECT * FROM docentes WHERE dni = ?';

    db.query(query, [dni], (err, result) => {
        if (err) {
            res.send({ error: 'Error en la búsqueda' });
        } else if (result.length > 0) {
            res.send({ success: true, alumno: result[0] });
        } else {
            res.send({ success: false, message: 'Docente no encontrado' });
        }
    });
});

app.post('/register', (req, res) => {
    const { apenomb, dni, email } = req.body;

    // Verificar si el alumno ya está registrado por DNI
    const checkQuery = `SELECT * FROM docentes WHERE dni = ?`;
    db.query(checkQuery, [dni], (err, result) => {
        if (err) {
            console.log('Error al verificar Docente:', err);
            return res.json({ success: false, message: 'Error en la validación.' });
        }

        if (result.length > 0) {
            // Si ya existe un registro con ese DNI, devolver mensaje de alerta
            return res.json({ success: false, message: 'El Docente ya está registrado.' });
        }

        // Si el alumno no existe, proceder con el registro
        const query = `INSERT INTO docentes (apenomb, dni, email) VALUES (?, ?, ?)`;
        const fecha = new Date();

        db.query(query, [apenomb, dni, email], (err, result) => {
            if (err) {
                console.log('Error al registrar Docente:', err);
                res.json({ success: false, message: 'Error al registrar Docente.' });
            } else {
                res.json({ success: true, message: 'Docente registrado con éxito.' });
            }
        });
    });
});

app.post('/registrar-asistencia', (req, res) => {
    const { iddocentes } = req.body;

    // Ajustar a hora local (Argentina, UTC-3)
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const fechaLocal = new Date(now.getTime() - offset);
    const fechaFormatted = fechaLocal.toISOString().split('T')[0];

    console.log(`Verificando asistencia de: ${iddocentes} para el día: ${fechaFormatted}`);

    const checkQuery = `SELECT * FROM asisd WHERE iddocentes = ? AND fecha = ?`;
    db.query(checkQuery, [iddocentes, fechaFormatted], (err, result) => {
        if (err) return res.json({ success: false, message: 'Error al verificar asistencia.' });

        if (result.length > 0) {
            return res.json({ success: false, message: 'El docente ya registró asistencia hoy.' });
        }

        const insertQuery = `INSERT INTO asisd (iddocentes, fecha, estado) VALUES (?, ?, ?)`;
        db.query(insertQuery, [iddocentes, fechaFormatted, 'Presente'], (err, result) => {
            if (err) return res.json({ success: false, message: 'Error al registrar asistencia.' });
            return res.json({ success: true, message: 'Asistencia registrada con éxito.' });
        });
    });
});


// Ruta para consultar asistencia
app.post('/consultar-asistencia', (req, res) => {
    const { dni } = req.body;
    const query = `
        SELECT a.idasistencia, al.apenomb, a.fecha, a.estado 
        FROM asisd a
        JOIN docentes al ON a.iddocentes = al.iddocentes
        WHERE al.dni = ?
    `;

    db.query(query, [dni], (err, result) => {
        if (err) {
            return res.json({ success: false, message: 'Error al consultar asistencia.' });
        }
        
        if (result.length > 0) {
            return res.json({ success: true, asistencias: result });
        } else {
            return res.json({ success: false, message: 'No se encontró asistencia para este alumno.' });
        }
    });
});
// Ruta para obtener las asistencias por fecha
app.get('/asistencia', (req, res) => {
    const { fecha } = req.query;
    if (!fecha) {
        return res.status(400).json({ error: 'Debe proporcionar una fecha' });
    }
    const sql = `SELECT a.idasistencia, al.apenomb, al.dni,al.carrera,a.fecha, a.estado 
                 FROM asisd a 
                 JOIN docentes al ON a.iddocentes = al.iddocentes
                 WHERE a.fecha = ?`;

    db.query(sql, [fecha], (error, results) => {
        if (error) {
            console.error('Error en la consulta:', error);
            return res.status(500).json({ error: 'Error al obtener los datos' });
        }

        // Formatear las fechas
        results.forEach(row => {
            const date = new Date(row.fecha);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Los meses van de 0-11
            const year = date.getFullYear();
            row.fecha = `${day}/${month}/${year}`;
        });

        res.json(results); // Devolver los resultados en formato JSON
    });
});

app.get('/cupos-capacitacion', (req, res) => {
    const query = `
      SELECT capacitacion, COUNT(*) AS cantidad
      FROM inscripciones
      GROUP BY capacitacion
    `;

    db.query(query, (err, result) => {
        if (err) {
            return res.status(500).send({ error: 'Error al consultar los cupos' });
        }

        // Convertir a formato {1: X, 2: Y, 3: Z}
        const cupos = { 1: 0, 2: 0, 3: 0 };
        result.forEach(row => {
            cupos[row.capacitacion] = row.cantidad;
        });

        res.send({ success: true, cupos });
    });
});

app.post("/buscar-docente", (req, res) => {
  const { dni } = req.body;
  const query = "SELECT * FROM docentes WHERE dni = ?";
  db.query(query, [dni], (err, result) => {
    if (err) return res.send({ error: "Error en la búsqueda" });
    if (result.length > 0) res.send({ success: true, docente: result[0] });
    else res.send({ success: false, message: "Docente no encontrado" });
  });
});


app.post('/inscribir-docente', (req, res) => {
  const { id_docente, capacitacion } = req.body;

  // Primero verificamos si el docente ya está inscripto en alguna capacitación
  const checkQuery = 'SELECT * FROM inscripciones WHERE iddocente = ?';

  db.query(checkQuery, [id_docente], (err, existing) => {
    if (err) {
      return res.status(500).send({ success: false, message: 'Error al verificar inscripción previa.' });
    }

    if (existing.length > 0) {
      return res.send({
        success: false,
        message: 'El docente ya está inscripto en una capacitación.',
      });
    }

    // Luego verificamos si hay cupo en la capacitación seleccionada
    const countQuery = 'SELECT COUNT(*) AS cantidad FROM inscripciones WHERE capacitacion = ?';

    db.query(countQuery, [capacitacion], (err, countResult) => {
      if (err) {
        return res.status(500).send({ success: false, message: 'Error al verificar cupos.' });
      }

      const cantidad = countResult[0].cantidad;

      if (cantidad >= 17) {
        return res.send({
          success: false,
          message: 'No hay cupos disponibles para esta capacitación.',
        });
      }

      // Si todo está OK, insertamos la inscripción
      const insertQuery = 'INSERT INTO inscripciones (iddocente, capacitacion) VALUES (?, ?)';
      db.query(insertQuery, [id_docente, capacitacion], (err, insertResult) => {
        if (err) {
          return res.status(500).send({ success: false, message: 'Error al registrar inscripción.' });
        }

        res.send({
          success: true,
          message: 'Inscripción realizada correctamente.',
        });
      });
    });
  });
});




// Ruta para generar el PDF con los datos de asistencia
app.get('/asistencia/pdf', (req, res) => {
    const { fecha } = req.query;

    // Consulta actualizada para obtener los datos de asistencia
    const query = `
        SELECT a.idasistencia, al.apenomb, al.dni, al.carrera, a.fecha, a.estado 
        FROM asisd a 
        JOIN docentes al ON a.iddocentes = al.iddocentes
        WHERE DATE(a.fecha) = ?
    `; 

    db.query(query, [fecha], (error, results) => {
        if (error) {
            console.error('Error al generar el PDF:', error);
            return res.status(500).send('Error al generar el PDF');
        }

        // Definición de la estructura del PDF
        const docDefinition = {
            content: [
                {
                    text: 'Registro de Asistencias\nCAPACITACIÓN - PMI\nI.E.S 6.021 Juan Carlos Dávalos',
                    style: 'header',
                    alignment: 'center'
                },
                { text: `Fecha: ${fecha}`, style: 'subheader', alignment: 'center' },
                { text: '\n' }, // Espacio
                {
                    style: 'tableExample',
                    table: {
                        headerRows: 1,
                        widths: ['*', 'auto', 'auto', 'auto', 'auto', 'auto'],
                        body: [
                            [
                                { text: 'ID', style: 'tableHeader' },
                                { text: 'Docente', style: 'tableHeader' },
                                { text: 'Documento', style: 'tableHeader' },                                
                                { text: 'Fecha', style: 'tableHeader' },
                                { text: 'Estado', style: 'tableHeader' }
                            ],
                            ...results.map(asistencia => [
                                asistencia.idasistencia,
                                asistencia.apenomb,
                                asistencia.dni,                             
                                asistencia.fecha ? new Date(asistencia.fecha).toLocaleDateString('es-AR') : '',
                                asistencia.estado
                            ])
                        ]
                    },

                    layout: {
                        hLineWidth: (i) => (i === 0 ? 2 : 0.5),
                        vLineWidth: (i) => (i === 0 ? 2 : 0.5),
                        hLineColor: () => '#007BFF',
                        vLineColor: () => '#007BFF',
                        fillColor: (rowIndex) => (rowIndex === 0 ? '#007BFF' : null), // Color de fondo para el encabezado
                    },
                }
            ],
            styles: {
                header: {
                    fontSize: 15,
                    bold: true,
                    margin: [0, 20, 0, 10],
                    color: '#007BFF' // Color del título
                },
                subheader: {
                    fontSize: 12,
                    margin: [0, 0, 0, 20]
                },
                tableExample: {
                    margin: [0, 5, 0, 15]
                },
                tableHeader: {
                    bold: true,
                    color: 'white',
                    alignment: 'center'
                }
            }
        };

        // Generar el PDF
        const pdfDoc = pdfmake.createPdf(docDefinition);
        const filePath = path.join(__dirname, 'reporte.pdf');

        pdfDoc.getBuffer((buffer) => {
            fs.writeFileSync(filePath, buffer); // Guardar PDF en el sistema de archivos

            res.download(filePath, 'reporte.pdf', (err) => {
                if (err) {
                    console.error('Error al enviar el PDF:', err);
                    res.status(500).send('Error al enviar el PDF');
                }
            });
        });
    });
});

// Iniciar el servidor
app.listen(port, '0.0.0.0',() => {
    console.log(`Servidor corriendo en el puerto ${port}`);
});

