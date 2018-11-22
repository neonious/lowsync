.. lowsyncdoc documentation master file, created by
   sphinx-quickstart on Thu Aug  9 21:39:03 2018.
   You can adapt this file completely to your liking, but it should at least
   contain the root `toctree` directive.

##################
lowsync manual
##################

A tool to program the neonious one and other low.js for ESP32 based devices with external IDEs. Allows the user to sync directories to the device, change settings, start/stop programs and more.

Getting started
==================

First, install lowsync

.. code-block:: bash

    npm install -g lowsync

After installing lowsync, run

.. code-block:: bash

    lowsync init

The program will ask you some questions and the configuration file *lowsync.config.json* will be created in the current working directory.

You may be able to configure your configuration further by reading the section about :doc:`configuration </configuration>` and editing your configuration manually.

After configuring the program, you may now run one of the many other :doc:`commands </commands/index>`.

For most commands the program will need to authenticate with the device. It will automatically guide you through the process, but here is a quick explaination on what exactly happens. Before executing a command, the password will be read from *lowsync.auth.config.json* in the current working directory or a parent directory. If the file is found, authentication is attempted. If the file cannot be found or the password is incorrect, the user will be asked for the password. Authentication is attempted again and if the password is correct and the user gives permission, the password is saved to the file.

.. toctree::
   commands/index
   configuration
   :hidden:
   :includehidden:
   :titlesonly:
   :maxdepth: 4

..
    Indices and tables
    ==================

    * :ref:`genindex`
    * :ref:`modindex`
    * :ref:`search`
