var app = new Vue({
    el: '#app',
    // storing the state of the page
    data: {
        connected: false,
        ros: null,
        logs: [],
        loading: false,
        showConnectionPanel: true,
        rosbridge_address: 'wss://i-0534cd53ae70b422c.robotigniteacademy.com/0209b84c-f48b-4e08-a7ef-f97390784837/rosbridge/',
        port: '9090',

        //action server
        goal: null,
        action: {
            goal: { position: {x: 0, y: 0, z: 0} },
            feedback: { position: 0, state: 'idle' },
            result: { success: false },
            status: { status: 0, text: '' },
        },

        // 3D all in one viewer
        viewer: null,
        tfClient: null,
        urdfClient: null,
        imClient:null, 
        cameraViewer: null, 

        // Dragzone Data
        dragging: false,
        x: 'no',
        y: 'no',
        dragCircleStyle: {
            margin: '0px',
            top: '0px',
            left: '0px',
            display: 'none',
            width: '75px',
            height: '75px',
        },

        // joystick valules
        joystick: {
            vertical: 0,
            horizontal: 0,
        },

        clickableObjects: [],
    },
    // helper methods to connect to ROS
    methods: {
        //============== START of WEB UI Element Control ==================
        toggleConnectionPanel: function() {
            this.showConnectionPanel = !this.showConnectionPanel;
            //since toggle_panel change layout of the websize, changing the all the viewer's size too
            this.$nextTick(() => {
                this.resizeViewer();
            });
        },

        //============== END of WEB UI Element Control ==================

        connect: function() {
            this.loading = true
            this.ros = new ROSLIB.Ros({
                url: this.rosbridge_address
            })

            this.ros.on('connection', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Connected!')
                this.connected = true
                this.loading = false

                //init camera
                this.setCamera({
                    suffixHost: '/cameras',
                    topic: '/camera/image_raw',  
                    divID: 'divCamera',  
                });

                //init 3D viewer
                this.setup3DViewer()

                // Add this listener to the canvas used by your viewer
                // this.viewer.renderer.domElement.addEventListener('mousedown', this.onDocumentMouseDown.bind(this), false);
                this.setupMarkerUpdateLogger()

                //toggle connection panel
                this.toggleConnectionPanel();
            })
            this.ros.on('error', (error) => {
                this.logs.unshift((new Date()).toTimeString() + ` - Error: ${error}`)
            })
            this.ros.on('close', () => {
                this.logs.unshift((new Date()).toTimeString() + ' - Disconnected!')
                this.connected = false
                this.loading = false
                //reset 3D model
                this.clear3DViewer()
                //reset cam
                document.getElementById('divCamera').innerHTML = ''
            })
        },

        setupMarkerUpdateLogger: function() {
            var listener = new ROSLIB.Topic({
                ros: this.ros,  // Assuming 'ros' is your ROSLIB.Ros instance connected to rosbridge
                name: '/simple_marker/update',
                messageType: 'visualization_msgs/InteractiveMarkerUpdate'
            });

            listener.subscribe(function(message) {
                console.log('Received message on /simple_marker/update:', message);
                // Optionally, you can unsubscribe if you only want to check a few messages
                // listener.unsubscribe();
            });
        },

        sendGoal: function() {
            console.log("tryhing to send goal")

            let actionClient = new ROSLIB.ActionClient({
                ros : this.ros,
                serverName : '/tortoisebot_as/',
                actionName : 'course_web_dev_ros/WaypointActionAction'
            })

            this.goal = new ROSLIB.Goal({
                actionClient : actionClient,
                goalMessage: {
                    ...this.action.goal
                }
            })

            this.goal.on('status', (status) => {
                this.action.status = status
            })

            this.goal.on('feedback', (feedback) => {
                this.action.feedback = feedback
            })

            this.goal.on('result', (result) => {
                this.action.result = result
            })

            this.goal.send()
        },
        cancelGoal: function() {
            this.goal.cancel()
        },

        // ==============================================================
        // ################# START 3D VIEWER SECTION ####################
        // ==============================================================

        setup3DViewer: function(fixed_frame = 'map') {
            var width = Math.max(document.getElementById('div3DViewer').clientWidth, 300); // Ensuring a minimum width of 300
            var height = Math.max(document.getElementById('div3DViewer').clientWidth, 200); // Ensuring a minimum height of 200

            console.log("Initializing ROS3D.Viewer with width: " + width + " and height: " + height);

            this.viewer = new ROS3D.Viewer({
                background: '#cccccc',
                divID: 'div3DViewer',
                width: 800,
                height: 600,
                antialias: true,
                fixedFrame: fixed_frame
            })

            // Add a grid.
            this.viewer.addObject(new ROS3D.Grid({
                color:'#0181c4',
                cellSize: 0.25,
                num_cells: 20
            }))

            // Setup a client to listen to TFs.
            this.tfClient = new ROSLIB.TFClient({
                ros: this.ros,
                fixedFrame: fixed_frame,
                angularThres: 0.01,
                transThres: 0.01,
                rate: 10.0
            })

            // Add OccupancyGridClient
            this.gridClient = new ROS3D.OccupancyGridClient({
                ros: this.ros,
                rootObject: this.viewer.scene,
                continuous: true,
                tfClient: this.tfClient,
                topic: '/map'  // Set the appropriate topic for your occupancy grid
            });

            //add interactive Marker Client
            var imClient = new ROS3D.InteractiveMarkerClient({
                ros: this.ros,
                tfClient: this.tfClient,
                topic: '/simple_marker',  // Correct topic for the interactive markers
                camera: this.viewer.camera,
                rootObject: this.viewer.selectableObjects
            });

            this.viewer.scene.addEventListener('click', function(event) {
                // Assuming raycaster and mouse are set up to handle the Three.js scene interaction
                raycaster.setFromCamera(mouse, camera);
                var intersects = raycaster.intersectObjects(viewer.selectableObjects.children, true);

                if (intersects.length > 0) {
                    console.log('Marker clicked!', intersects[0].object);
                    // Additional logic here
                }
            });

            this.viewer.camera.lookAt(new THREE.Vector3(1, 1, 0)); // Updated to look directly at the sphere's position
            this.viewer.camera.updateProjectionMatrix();

            // Setup the URDF client.
            this.urdfClient = new ROS3D.UrdfClient({
                ros: this.ros,
                param: 'robot_description',
                tfClient: this.tfClient,
                // We use "path: location.origin + location.pathname"
                // instead of "path: window.location.href" to remove query params,
                // otherwise the assets fail to load
                path: location.origin + location.pathname,
                rootObject: this.viewer.scene,
                loader: ROS3D.COLLADA_LOADER_2
            })
        },

        clear3DViewer: function() {
            if (this.viewer) {
                // Dispose of all objects in the scene
                while(this.viewer.scene.children.length > 0) { 
                    const object = this.viewer.scene.children[0];
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) object.material.dispose();
                    this.viewer.scene.remove(object);
                }
                this.viewer.renderer.dispose(); // Dispose of the renderer
                this.viewer = null; // Remove reference to the viewer
                document.getElementById('div3DViewer').innerHTML = ''; // Clear the HTML
            }
        },

        resizeViewer: function() {
            if (this.viewer) {
                var width = Math.max(document.getElementById('div3DViewer').clientWidth, 300);
                var height = Math.max(document.getElementById('div3DViewer').clientHeight, 200);
                this.viewer.resize(width, height);
            }
        },

        // ==============================================================
        // ################# END of 3D VIEWER SECTION ###################
        // ==============================================================

        disconnect: function() {
            this.ros.close()
        },
        sendCommand: function() {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            })
            let message = new ROSLIB.Message({
                linear: { x: 1, y: 0, z: 0, },
                angular: { x: 0, y: 0, z: 0.5, },
            })
            topic.publish(message)
        },

        // pub speed with parameters for linear x and angular z velocity
        pubSpeed: function(lin_x, ang_z) {
            let topic = new ROSLIB.Topic({
                ros: this.ros,
                name: '/cmd_vel',
                messageType: 'geometry_msgs/Twist'
            });
            let message = new ROSLIB.Message({
                linear: { x: lin_x, y: 0, z: 0 },
                angular: { x: 0, y: 0, z: ang_z }
            });
            topic.publish(message);
        },

        startDrag() {
            this.dragging = true
            this.x = this.y = 0
        },
        stopDrag() {
            this.dragging = false
            this.x = this.y = 'no'
            this.dragCircleStyle.display = 'none'
            this.resetJoystickVals()
        },
        doDrag(event) {
            if (this.dragging) {
                this.x = event.offsetX
                this.y = event.offsetY
                let ref = document.getElementById('dragstartzone')
                this.dragCircleStyle.display = 'inline-block'

                let minTop = ref.offsetTop - parseInt(this.dragCircleStyle.height) / 2
                let maxTop = minTop + 200
                let top = this.y + minTop
                this.dragCircleStyle.top = `${top}px`

                let minLeft = ref.offsetLeft - parseInt(this.dragCircleStyle.width) / 2
                let maxLeft = minLeft + 200
                let left = this.x + minLeft
                this.dragCircleStyle.left = `${left}px`

                this.setJoystickVals()
            }
        },
        setJoystickVals() {
            this.joystick.vertical = -1 * ((this.y / 200) - 0.5)
            this.joystick.horizontal = +1 * ((this.x / 200) - 0.5)
            //send joystick speed
            this.pubSpeed(this.joystick.vertical, -1*this.joystick.horizontal)
        },
        resetJoystickVals() {
            this.joystick.vertical = 0
            this.joystick.horizontal = 0
            this.pubSpeed(this.joystick.vertical, this.joystick.horizontal)
        },

        // set camera
        setCamera: function(options) {
            options = options || {};
            let topic = options.topic || '/camera/image_raw';  // Default topic
            let divID = options.divID || 'divCamera';              // Default DIV ID
            let suffixHost = options.suffixHost;                               // Host must be provided, no default
            if (!suffixHost) {
                console.error('Suffix_host parameter is required.');
                return; // Exit the function if no host is provided
            }
            let without_wss = this.rosbridge_address.split('wss://')[1];
            let domain = without_wss.split('/')[0] + '/' + without_wss.split('/')[1];
            let host = domain + suffixHost;
            let width = Math.max(document.getElementById('divCamera').clientWidth, 480);
            let height = Math.max(document.getElementById('divCamera').clientHeight, 240);
            this.cameraViewer = new MJPEGCANVAS.Viewer({
                divID: divID,
                host: host,
                width: width,
                height: height,
                topic: topic,
                ssl: true,
            });
        },
    },
    mounted() {
        // page is ready
        window.addEventListener('mouseup', this.stopDrag)
        window.addEventListener('resize', this.resizeViewer);
    },
    beforeDestroy: function() {
        window.removeEventListener('resize', this.resizeViewer);
    }
})